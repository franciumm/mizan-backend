# Mizan Backend — Design

**Date:** 2026-08-06
**Status:** Approved with revisions (JS, layered, concise)
**Stack:** Node.js (ES modules) + Express + MongoDB Atlas + Mongoose

> **Revision 2026-08-06 (post-approval):** Originally specified Postgres + Drizzle. User redirected to MongoDB + Mongoose with an Atlas connection. Schema (§3) and project layout (§6) updated; everything else (algorithms, API, algorithms) carries over unchanged.

## 1. Purpose

Backend for the Mizan Life OS frontend. Replaces `localStorage` with a real DB so state survives browser wipes and is reachable from any device on the same machine. Single user, localhost only, no auth. Voice transcription stays in the browser; backend never touches audio.

## 2. Architecture

Layered. Each layer talks only to the one below.

```
routes/      → Express handlers. HTTP-only. Parse req, call service, send res. No business logic.
services/    → Business logic. Rollover, ripple, migrate, ai-proxy. Pure where possible.
repositories/ → DB access. One file per entity (taskRepo, goalRepo, …). Returns plain objects via Mongoose lean().
db/          → Mongoose connection + models. Nothing else imports mongoose directly.
middleware/  → errors, logging.
lib/         → Pure utilities: cairo dates, validation helpers.
schemas/     → Zod request-body schemas, co-located with routes.
```

**Cross-cutting rules:**
- Services throw `HttpError(status, message)`. One error middleware catches and formats `{ error }`.
- `node:crypto.randomUUID()` for IDs on top-level docs (tasks/goals/horizons) to keep migration compatible with existing localStorage UUIDs. Embedded subdocs use default ObjectId.
- Global `fetch` for OpenRouter. No `axios`.
- Idempotency: `GET /sync`, ripple no-ops when state matches, migrate is re-runnable.
- `TZ=Africa/Cairo` env var drives all date math.
- Mongoose transactions (Atlas replica set supports them) wrap multi-step mutations: ripple, rollover.

## 3. Schema (MongoDB via Mongoose)

Collections (7). IDs are UUID strings for top-level docs (migration compatibility); embedded subdocs use ObjectId.

| Collection | `_id` | Indexes | Notes |
|---|---|---|---|
| `horizons` | uuid string | `{ position: 1 }` | `label`, `startDate`, `targetDate`, `position` |
| `goals` | uuid string | `{ horizonId: 1, position: 1 }` | `title`, `tasksDone` (default 0), `position`, `parentGoalIds: [uuid]` (replaces `goal_parents` join table) |
| `tasks` | uuid string | `{ dateKey: 1 }`, `{ goalIds: 1 }` | `dateKey` 'YYYY-MM-DD', `title`, `category` enum, `range`, `minutes`, `done`, `rolled` (default 0), `kind` enum('mission','support'), `details?`, `position`, `goalIds: [uuid]` (replaces `task_goals` join table) |
| `daily_logs` | `dateKey` string | unique on `_id` | `mode` enum('grinding','recovery','vacation'), `challenge`, `challengeDone`, `quranDone`, `highestTierDone` (default 0), `energy`/`pain`/`focus`, `contextNotes: [String]`, **`prayers: [{ name, time, done, position }]` embedded** (replaces separate `prayers` collection) |
| `past_tasks` | ObjectId | `{ dateKey: -1, createdAt: -1 }`, TTL: 30 days via `expireAfterSeconds` on `createdAt` | `dateKey`, `taskJson` (Mixed). Auto-trimmed by MongoDB TTL index. |
| `drafts` | `'planner' \| 'coach'` string | unique on `_id` | `value` (default ''). Replaces `mizan-draft-*` localStorage keys. |
| `ai_responses` | ObjectId | `{ createdAt: -1 }` | Audit log. `endpoint`, `dateKey`, `requestJson`, `responseJson`, `fallback`, `createdAt` |

**Category enum** = `Business | Health | Faith | College | Mind | Personality | Family | Life | Ops`. First 7 match existing data; Life/Ops future-proofed per handoff.

**No SQL cascades — handle in code.** Delete goal → remove its `id` from every `goals.parentGoalIds` and `tasks.goalIds` array (Mongoose middleware hook). Delete task → already isolated (no join table).

**Why embedded prayers:** one day = one document. Prayers are always read/written with the daily log. Avoids a join and an extra collection. Frontend already pairs them.

**Why arrays instead of join tables:** MongoDB's idiomatic pattern. Ripple's BFS just reads `parentGoalIds`. Tasks-to-goals mapping just reads `goalIds`. No `$lookup` needed.

## 4. Algorithms (server-side)

### Rollover — lazy, in `GET /sync`
Runs in a Mongoose `session.withTransaction()` when `max(daily_logs._id) < today` (the `_id` IS the dateKey):
0. If `max(daily_logs._id)` is NULL (fresh DB) → insert today's `daily_logs` doc with defaults + empty `prayers` array, return. No task rollover.
1. Snapshot yesterday's tasks into `past_tasks` (one doc with `taskJson` array).
2. If tomorrow tasks exist → promote (`dateKey=today`, `done=false`), delete yesterday's unfinished. Else → roll unfinished (`rolled = min(4, rolled+1)`, `done=false`), set `dateKey=today`.
3. Upsert today's `daily_logs` doc with reset defaults (`energy=3, pain=2, focus=3`, mode grinding). `prayers: []` — **frontend owns prayer times** (via its existing `getCairoPrayerTimes`); on first sync of a new day it sees `prayers: []`, recomputes locally, and `PATCH /daily-log/:dateKey` to persist.
4. `context_notes` and `highest_tier_done` persist across days (they're on the previous day's doc; rollover does NOT copy them — frontend re-injects or leaves default).
5. `past_tasks` auto-trimmed by MongoDB TTL index (`expireAfterSeconds = 30 days` on `createdAt`).

### Ripple — in `PATCH /tasks/:id` transaction
`applyTaskRipple(taskId, nextDone)`:
- In `session.withTransaction()`: read task; if `done === nextDone`, return (idempotent).
- Update `tasks.done`.
- BFS up via each goal's `parentGoalIds` array, starting from `task.goalIds` roots.
- For each visited goal: `tasksDone = max(0, tasksDone + (nextDone ? 1 : -1))`.
- `visited` set prevents cycles.
- Return updated goals so client gets authoritative state.

## 5. API

All JSON. Errors: `{ error }` with appropriate status. `date_key` params are `'YYYY-MM-DD'`.

**Data:**
- `GET /api/sync?date=<YYYY-MM-DD>` — rollover check + full payload: `{ horizons, goals, goalParents, tasks: { today, tomorrow }, dailyLog, prayers, pastTasks, drafts }`
- `POST /api/tasks` — create. Returns task with new uuid.
- `PATCH /api/tasks/:id` — partial update. If `done` changed → ripple. Returns `{ task, goals }`.
- `DELETE /api/tasks/:id`
- `PATCH /api/goals/:id` — `{ title?, tasksDone?, parentGoalIds? }`. Diff/rewrite `goal_parents`.
- `PATCH /api/horizons/:id` — `{ label?, startDate?, targetDate? }`
- `PATCH /api/daily-log/:dateKey` — any subset + `prayers` (replace) + `contextNotes` (replace)
- `PUT /api/drafts` — `{ planner?, coach? }`

**Migration:**
- `POST /api/migrate` — body: `{ lifeOsV2?, lifeOsV1?, goalsV2?, goalsV1?, insights? }`. Validates with rules ported from frontend (`isTask`, `isCheckIn`, etc.), repairs (`linkedGoalId`→`linkedGoalIds`, v1 string goals → objects). Uses Mongoose `bulkWrite` with `upsert` operations; existing `_id`s (UUID strings from localStorage) make it idempotent. Returns `{ tasks, goals, horizons, pastDays, insights }`.

**AI (OpenRouter proxied):**
- `POST /api/arrange` `{ brainDump, context }` → `{ plan, fallback?, error? }`
- `POST /api/coach` `{ message, context, mode? }` → `{ reply, error? }`
- `POST /api/insights` `{ context }` → `{ headline, stat, risk, lifeMap, emptyState?, fallback? }`

Direct ports of existing Next.js routes (same prompts, JSON schemas, fallbacks). Optionally writes to `ai_responses`. `OPENROUTER_API_KEY` lives only in server `.env`.

## 6. Project Layout

```
mizan-backend/
├── .env.example
├── .gitignore
├── package.json
├── src/
│   ├── server.js
│   ├── env.js
│   ├── db/
│   │   ├── client.js          # Mongoose connect + disconnect helpers
│   │   └── schema.js          # All Mongoose models in one file
│   ├── repositories/
│   │   ├── task.js
│   │   ├── goal.js
│   │   ├── horizon.js
│   │   ├── daily-log.js       # owns prayers subdocs (no separate prayer repo)
│   │   ├── past-task.js
│   │   └── draft.js
│   ├── services/
│   │   ├── sync.js
│   │   ├── rollover.js
│   │   ├── ripple.js
│   │   ├── migrate.js
│   │   ├── arrange.js
│   │   ├── coach.js
│   │   └── insights.js
│   ├── routes/
│   │   ├── sync.js
│   │   ├── tasks.js
│   │   ├── goals.js
│   │   ├── horizons.js
│   │   ├── daily-log.js
│   │   ├── drafts.js
│   │   ├── migrate.js
│   │   └── ai.js              # arrange + coach + insights
│   ├── schemas/
│   │   └── requests.js        # Zod schemas
│   ├── middleware/
│   │   ├── error.js
│   │   └── log.js
│   └── lib/
│       ├── cairo.js           # cairoDateKey, cairoDateAddDays
│       ├── openrouter.js      # port of frontend's _lib/openrouter.ts
│       └── http-error.js
└── test/
    ├── ripple.test.js
    ├── rollover.test.js
    ├── migrate.test.js
    └── cairo.test.js
```

## 7. `.env`

```env
PORT=8787
NODE_ENV=development
TZ=Africa/Cairo
CORS_ORIGIN=http://localhost:3000
MONGODB_URI=mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB_NAME=mizan
OPENROUTER_API_KEY=sk-or-v1-…
OPENROUTER_MODEL=deepseek/deepseek-v4-flash
```

**Two connections only:** MongoDB (`MONGODB_URI`) and OpenRouter (`OPENROUTER_API_KEY`). Both in `.env`.

**Atlas setup:** create a free M0 cluster, add a database user, whitelist your IP (or `0.0.0.0/0` for dev), grab the SRV connection string. The cluster's replica set supports transactions out of the box.

**Test DB:** same cluster, separate database — set `MONGODB_DB_NAME=mizan_test` in the test environment. Reset between tests via `deleteMany({})` on each collection.

## 8. Testing

Vitest + supertest. Integration tests hit a real throwaway MongoDB database on the same Atlas cluster (not mocks) so transaction semantics are honest.

- **Unit:** cairo date math, ripple BFS (incl. cycles), migration payload repair.
- **Integration:** rollover (no-op / promote-tomorrow / roll-unfinished / archive), sync payload shape.
- **AI:** mock OpenRouter `fetch`; assert fallback paths fire on `length` finish reason and on network failure.

## 9. Out of Scope

Auth, multi-user, rate limiting, deploy manifests, cron, audio upload. None of these are needed for a single-user localhost app. Revisit when requirements change.
