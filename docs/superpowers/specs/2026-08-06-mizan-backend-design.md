# Mizan Backend — Design

**Date:** 2026-08-06
**Status:** Approved with revisions (JS, layered, concise)
**Stack:** Node.js (ES modules) + Express + PostgreSQL + Drizzle ORM (JS)

## 1. Purpose

Backend for the Mizan Life OS frontend. Replaces `localStorage` with a real DB so state survives browser wipes and is reachable from any device on the same machine. Single user, localhost only, no auth. Voice transcription stays in the browser; backend never touches audio.

## 2. Architecture

Layered. Each layer talks only to the one below.

```
routes/      → Express handlers. HTTP-only. Parse req, call service, send res. No business logic.
services/    → Business logic. Rollover, ripple, migrate, ai-proxy. Pure where possible.
repositories/ → DB access. One file per entity (taskRepo, goalRepo, …). Returns plain rows.
db/          → Drizzle client + schema. Nothing else imports drizzle directly.
middleware/  → errors, logging.
lib/         → Pure utilities: cairo dates, validation helpers.
schemas/     → Zod request-body schemas, co-located with routes.
```

**Cross-cutting rules:**
- Services throw `HttpError(status, message)`. One error middleware catches and formats `{ error }`.
- `node:crypto.randomUUID()` for IDs. No `uuid` dep.
- Global `fetch` for OpenRouter. No `axios`.
- Idempotency: `GET /sync`, ripple no-ops when state matches, migrate is re-runnable.
- `TZ=Africa/Cairo` env var drives all date math.

## 3. Schema (Postgres via Drizzle)

| Table | PK / FKs | Notes |
|---|---|---|
| `horizons` | `id` uuid PK | `label`, `start_date`, `target_date`, `position` |
| `goals` | `id` uuid PK, `horizon_id` FK→horizons | `title`, `tasks_done` int default 0 |
| `goal_parents` | (`goal_id`, `parent_goal_id`) composite PK | Self-edge on goals for cascading ripple |
| `tasks` | `id` uuid PK | `date_key` 'YYYY-MM-DD', `title`, `category` enum, `range` text, `minutes` int, `done` bool, `rolled` int default 0, `kind` enum('mission','support'), `details` text?, `position` int |
| `task_goals` | (`task_id`, `goal_id`) composite PK | Many-to-many task↔goal |
| `daily_logs` | `date_key` PK | `mode` enum('grinding','recovery','vacation'), `challenge` text, `challenge_done` bool, `quran_done` bool, `highest_tier_done` int default 0, `energy`/`pain`/`focus` int, `context_notes` text[] |
| `prayers` | `id` PK, `date_key` FK→daily_logs | `name`, `time`, `done` |
| `past_tasks` | `id` PK | `date_key`, `task_json` jsonb. Trimmed to last 30 days |
| `drafts` | `key` text PK | Two fixed rows: `'planner'`, `'coach'`. `value` text. Replaces `mizan-draft-*` localStorage keys. |
| `ai_responses` | `id` PK | Audit log. `endpoint`, `date_key`, `request_json`, `response_json`, `fallback` bool, `created_at` |

**Category enum** = `Business | Health | Faith | College | Mind | Personality | Family | Life | Ops`. First 7 match existing data; Life/Ops future-proofed per handoff.

**Cascades:** delete goal → cascade delete `goal_parents` + `task_goals`. Delete task → cascade delete `task_goals`.

## 4. Algorithms (server-side)

### Rollover — lazy, in `GET /sync`
Runs in a transaction when `max(daily_logs.date_key) < today`:
0. If `max(daily_logs.date_key)` is NULL (fresh DB) → insert today's `daily_logs` with defaults + empty prayers list, return. No task rollover.
1. Snapshot yesterday's tasks into `past_tasks`.
2. If `tomorrow` tasks exist → promote (set `date_key=today`, `done=false`), drop yesterday's unfinished. Else → roll unfinished (`rolled = min(4, rolled+1)`, `done=false`), keep `date_key=today`.
3. Insert today's `daily_logs` row with reset defaults (`energy=3, pain=2, focus=3`, mode grinding). Prayers list starts empty — **frontend owns prayer times** (via its existing `getCairoPrayerTimes`); on first sync of a new day it sees `prayers: []`, recomputes locally, and `PATCH /daily-log/:dateKey` to persist.
4. Trim `past_tasks` to 30 days.
5. `context_notes` and `highest_tier_done` persist across days.

### Ripple — in `PATCH /tasks/:id` transaction
`applyTaskRipple(taskId, nextDone)`:
- Lock task row (`FOR UPDATE`); if `done === nextDone`, return (idempotent).
- Update `tasks.done`.
- BFS up via `goal_parents`: collect all reachable goal IDs from `task_goals` roots.
- For each: `UPDATE goals SET tasks_done = GREATEST(0, tasks_done + (nextDone ? 1 : -1))`.
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
- `POST /api/migrate` — body: `{ lifeOsV2?, lifeOsV1?, goalsV2?, goalsV1?, insights? }`. Validates with rules ported from frontend (`isTask`, `isCheckIn`, etc.), repairs (`linkedGoalId`→`linkedGoalIds`, v1 string goals → objects). Upserts the imported day's `daily_logs` row so rollover doesn't double-fire. Idempotent. Returns `{ tasks, goals, horizons, pastDays, insights }`.

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
├── drizzle.config.js
├── src/
│   ├── server.js
│   ├── env.js
│   ├── db/
│   │   ├── client.js
│   │   └── schema.js
│   ├── repositories/
│   │   ├── task.js
│   │   ├── goal.js
│   │   ├── horizon.js
│   │   ├── daily-log.js
│   │   ├── prayer.js
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
│       ├── cairo.js           # cairoDateKey, cairoDateAddDays, prayer times
│       ├── openrouter.js      # port of frontend's _lib/openrouter.ts
│       └── http-error.js
├── migrations/                # drizzle-kit output
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
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/mizan
OPENROUTER_API_KEY=sk-or-v1-…
OPENROUTER_MODEL=deepseek/deepseek-v4-flash
```

**Two connections only:** Postgres (`DATABASE_URL`) and OpenRouter (`OPENROUTER_API_KEY`). Both in `.env`.

**Local Postgres (pick one):**
```bash
# Docker
docker run -d --name mizan-pg -p 5432:5432 \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=mizan \
  -v mizan-pg-data:/var/lib/postgresql/data postgres:16

# Homebrew
brew install postgresql@16 && brew services start postgresql@16 && createdb mizan
```

## 8. Testing

Vitest + supertest. Integration tests hit a real throwaway Postgres DB (not mocks) so transaction semantics are honest.

- **Unit:** cairo date math, ripple BFS (incl. cycles), migration payload repair.
- **Integration:** rollover (no-op / promote-tomorrow / roll-unfinished / archive), sync payload shape.
- **AI:** mock OpenRouter `fetch`; assert fallback paths fire on `length` finish reason and on network failure.

## 9. Out of Scope

Auth, multi-user, rate limiting, deploy manifests, cron, audio upload. None of these are needed for a single-user localhost app. Revisit when requirements change.
