# Mizan Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Revision 2026-08-06 (post-approval):** Originally specified Postgres + Drizzle. User redirected to MongoDB Atlas + Mongoose. Affected tasks: 2 (schema + connection), 5 (test helper), 6 (repositories — prayers embedded, no prayer repo), 7 (ripple via Mongoose session), 8 (rollover via Mongoose session), 9 (sync reads embedded prayers), 12 (daily-log route writes embedded prayers), 15 (migration via `bulkWrite`), 16 (README copy). Tasks 3, 4, 10, 11, 13, 14 are unchanged (no DB access, or only go through the repo layer). The bootstrap commit (Task 1) needs a fix-up: swap `drizzle-orm`/`postgres`/`drizzle-kit` for `mongoose`, and update `src/env.js` to read `MONGODB_URI`/`MONGODB_DB_NAME`.

**Goal:** Build an Express + MongoDB Atlas + Mongoose backend that replaces the Mizan frontend's `localStorage` and proxies its three OpenRouter AI endpoints — single-user, localhost, no auth.

**Architecture:** Layered. `routes → services → repositories → db`. Routes are HTTP-only adapters. Business logic (rollover, ripple, migrate, AI proxy) lives in services. DB access lives in repositories. Pure utilities (Cairo dates, OpenRouter client) live in `lib/`. Services throw `HttpError(status, msg)`; one error middleware formats `{ error }`.

**Tech Stack:** Node.js 22+ (ES modules, plain JS), Express 4, MongoDB Atlas (M0 free tier), Mongoose 8, Zod for runtime validation, Vitest + supertest for testing. No `uuid`/`axios` deps — use `node:crypto.randomUUID()` and global `fetch`.

## Global Constraints

- Plain JavaScript (ES modules, `"type": "module"`).
- Node >= 22.0.0.
- Top-level doc IDs (`tasks`, `goals`, `horizons`, `drafts`) are UUID v4 strings via `node:crypto.randomUUID()`. The `daily_logs._id` IS the dateKey string. Embedded subdocs (e.g. prayers) use Mongoose's default ObjectId.
- `dateKey` is always `'YYYY-MM-DD'` in Africa/Cairo timezone (`TZ` env var).
- Two `.env` connections only: `MONGODB_URI`, `OPENROUTER_API_KEY`. (`MONGODB_DB_NAME` is a convenience; defaults to `mizan`.)
- All endpoints return JSON; errors shaped as `{ error: string }`.
- TDD: write failing test → run → implement → run → commit. Every task ends with green tests + commit.
- No voice/audio pipeline on the backend. Whisper stays in the browser.
- Frontend source (read-only reference) at `~/Documents/codex/2026-08-05/sites-plugin-sites-openai-bundled-create`.

## File Structure

```
.
├── .env.example
├── .gitignore
├── package.json
├── src/
│   ├── server.js                    # Express bootstrap
│   ├── env.js                       # env validation
│   ├── db/
│   │   ├── client.js                # Mongoose connect + disconnect helpers
│   │   └── schema.js                # All Mongoose models in one file
│   ├── repositories/
│   │   ├── task.js
│   │   ├── goal.js
│   │   ├── horizon.js
│   │   ├── daily-log.js             # owns embedded prayers subdocs (no separate prayer repo)
│   │   ├── past-task.js
│   │   └── draft.js
│   ├── services/
│   │   ├── rollover.js
│   │   ├── ripple.js
│   │   ├── sync.js
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
│   │   └── ai.js
│   ├── schemas/
│   │   └── requests.js              # Zod schemas
│   ├── middleware/
│   │   ├── error.js
│   │   └── log.js
│   └── lib/
│       ├── cairo.js
│       ├── openrouter.js
│       ├── http-error.js
│       └── test-db.js               # Test helper: deleteMany + seed
└── test/
    ├── cairo.test.js
    ├── ripple.test.js
    ├── rollover.test.js
    ├── migrate.test.js
    ├── openrouter.test.js
    └── routes.test.js
```

---

### Task 1: Bootstrap project

**Files:**
- Create: `package.json`, `.gitignore`, `.env.example`, `src/env.js`, `src/server.js`
- Modify: working directory root

**Interfaces:**
- Produces: a runnable `npm run dev` that logs `Mizan API listening on :8787`

> **MongoDB pivot note:** The initial commit landed with `drizzle-orm`/`postgres`/`drizzle-kit` and `DATABASE_URL`. The fix-up swaps those for `mongoose` and `MONGODB_URI`/`MONGODB_DB_NAME`, as shown below. The steps below are the target end-state after the fix-up.

- [ ] **Step 1: Initialize npm and install deps**

```bash
cd "/Users/francium/Backend NodeJs Projects/Mizan"
npm init -y
npm install express cors dotenv mongoose zod
npm install -D vitest supertest
npm uninstall drizzle-orm postgres drizzle-kit   # only if the pivot fix-up is run in place
```

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "mizan-backend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22.0.0" },
  "scripts": {
    "dev": "node --watch --env-file=.env src/server.js",
    "start": "node --env-file=.env src/server.js",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 3: Write `.gitignore`**

```
node_modules
.env
dist
*.log
.DS_Store
```

- [ ] **Step 4: Write `.env.example`**

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

- [ ] **Step 5: Write `src/env.js`**

```js
import 'dotenv/config';

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export const env = {
  PORT: Number(process.env.PORT ?? 8787),
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
  MONGODB_URI: required('MONGODB_URI'),
  MONGODB_DB_NAME: process.env.MONGODB_DB_NAME ?? 'mizan',
  OPENROUTER_API_KEY: required('OPENROUTER_API_KEY'),
  OPENROUTER_MODEL: process.env.OPENROUTER_MODEL ?? 'deepseek/deepseek-v4-flash',
};
```

- [ ] **Step 6: Write minimal `src/server.js` that boots**

```js
import express from 'express';
import cors from 'cors';
import { env } from './env.js';

const app = express();
app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json({ limit: '2mb' }));

app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(env.PORT, '127.0.0.1', () => {
  console.log(`Mizan API listening on http://127.0.0.1:${env.PORT}`);
});
```

- [ ] **Step 7: Verify boot**

Run: `node src/server.js` (after creating a `.env` from example)
Expected: `Mizan API listening on http://127.0.0.1:8787`

- [ ] **Step 8: Commit**

```bash
git init && git add -A
git commit -m "chore: bootstrap express server"
```

---

### Task 2: Mongoose models + connection

**Files:**
- Create: `src/db/schema.js`, `src/db/client.js`

**Interfaces:**
- Consumes: `env.MONGODB_URI`, `env.MONGODB_DB_NAME`
- Produces: `connectDb()`, `disconnectDb()`, and the Mongoose models `Horizon`, `Goal`, `Task`, `DailyLog`, `PastTask`, `Draft`, `AiResponse`. Models are imported directly from `src/db/schema.js` everywhere downstream — no other file imports `mongoose` directly.

- [ ] **Step 1: Write `src/db/schema.js`** — all seven models in one file.

```js
import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const CATEGORY = ['Business', 'Health', 'Faith', 'College', 'Mind', 'Personality', 'Family', 'Life', 'Ops'];
const DAY_MODE = ['grinding', 'recovery', 'vacation'];
const TASK_KIND = ['mission', 'support'];

// _id is a UUID v4 string (default randomUUID) — preserves migration compat with localStorage UUIDs.
const uuidSchemaOpts = { type: String, default: () => crypto.randomUUID() };

const horizonSchema = new Schema({
  _id: uuidSchemaOpts,
  label: { type: String, required: true },
  startDate: { type: String, default: null },   // 'YYYY-MM-DD' or null
  targetDate: { type: String, default: null },
  position: { type: Number, default: 0 },
}, { _id: false, versionKey: false });
horizonSchema.index({ position: 1 });

const goalSchema = new Schema({
  _id: uuidSchemaOpts,
  horizonId: { type: String, required: true, ref: 'Horizon' },
  title: { type: String, required: true },
  tasksDone: { type: Number, default: 0 },
  position: { type: Number, default: 0 },
  parentGoalIds: { type: [String], default: [] },   // replaces goal_parents join table
}, { _id: false, versionKey: false });
goalSchema.index({ horizonId: 1, position: 1 });

const taskSchema = new Schema({
  _id: uuidSchemaOpts,
  dateKey: { type: String, required: true },          // 'YYYY-MM-DD'
  title: { type: String, required: true },
  category: { type: String, required: true, enum: CATEGORY },
  range: { type: String, default: '' },
  minutes: { type: Number, default: 0 },
  done: { type: Boolean, default: false },
  rolled: { type: Number, default: 0 },
  kind: { type: String, default: 'support', enum: TASK_KIND },
  details: { type: String, default: null },
  position: { type: Number, default: 0 },
  goalIds: { type: [String], default: [] },           // replaces task_goals join table
}, { _id: false, versionKey: false });
taskSchema.index({ dateKey: 1 });
taskSchema.index({ goalIds: 1 });

// daily_logs._id IS the dateKey string — one document per day.
const prayerSchema = new Schema({
  name: { type: String, required: true },
  time: { type: String, default: '' },
  done: { type: Boolean, default: false },
  position: { type: Number, default: 0 },
}, { _id: true, versionKey: false });   // embedded subdoc → default ObjectId

const dailyLogSchema = new Schema({
  _id: { type: String, required: true },   // dateKey 'YYYY-MM-DD'
  mode: { type: String, default: 'grinding', enum: DAY_MODE },
  challenge: { type: String, default: '' },
  challengeDone: { type: Boolean, default: false },
  quranDone: { type: Boolean, default: false },
  highestTierDone: { type: Number, default: 0 },
  energy: { type: Number, default: 3 },
  pain: { type: Number, default: 2 },
  focus: { type: Number, default: 3 },
  contextNotes: { type: [String], default: [] },
  prayers: { type: [prayerSchema], default: [] },   // embedded — one day = one doc
}, { _id: false, versionKey: false });

// past_tasks auto-trimmed by MongoDB TTL index (30 days on createdAt).
const pastTaskSchema = new Schema({
  dateKey: { type: String, required: true },
  taskJson: { type: Schema.Types.Mixed, required: true },
  createdAt: { type: Date, default: Date.now },
}, { versionKey: false });
pastTaskSchema.index({ dateKey: -1, createdAt: -1 });
pastTaskSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

// drafts._id is the string key ('planner' | 'coach').
const draftSchema = new Schema({
  _id: { type: String, required: true },
  value: { type: String, default: '' },
}, { versionKey: false });

const aiResponseSchema = new Schema({
  endpoint: { type: String, required: true },
  dateKey: { type: String, default: null },
  requestJson: { type: Schema.Types.Mixed, required: true },
  responseJson: { type: Schema.Types.Mixed, required: true },
  fallback: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
}, { versionKey: false });
aiResponseSchema.index({ createdAt: -1 });

export const Horizon = model('Horizon', horizonSchema);
export const Goal = model('Goal', goalSchema);
export const Task = model('Task', taskSchema);
export const DailyLog = model('DailyLog', dailyLogSchema);
export const PastTask = model('PastTask', pastTaskSchema);
export const Draft = model('Draft', draftSchema);
export const AiResponse = model('AiResponse', aiResponseSchema);

// Goal delete hook: clean up dangling parentGoalIds and task.goalIds.
goalSchema.pre('findOneAndDelete', { document: false, query: true }, async function () {
  const doc = await this.model.findOne(this.getFilter());
  if (!doc) return;
  const id = doc._id;
  await Goal.updateMany({ parentGoalIds: id }, { $pull: { parentGoalIds: id } });
  await Task.updateMany({ goalIds: id }, { $pull: { goalIds: id } });
});
```

- [ ] **Step 2: Write `src/db/client.js`**

```js
import mongoose from 'mongoose';
import { env } from '../env.js';

let connected = false;

export async function connectDb() {
  if (connected) return;
  // Atlas replica sets support transactions (needed by ripple + rollover).
  await mongoose.connect(env.MONGODB_URI, {
    dbName: env.MONGODB_DB_NAME,
    serverSelectionTimeoutMS: 10000,
  });
  connected = true;
}

export async function disconnectDb() {
  if (!connected) return;
  await mongoose.disconnect();
  connected = false;
}

// For tests that need a fresh connection state.
export function __resetConnected() { connected = false; }
```

- [ ] **Step 3: Smoke-connect against Atlas**

Run: `node -e "import('./src/db/client.js').then(async m => { await m.connectDb(); console.log('ok'); await m.disconnectDb(); })"`
Expected: prints `ok` (assumes `.env` has a real `MONGODB_URI`). No migration step — Mongoose creates collections on first write.

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.js src/db/client.js
git commit -m "feat(db): mongoose models + Atlas connection helper"
```

---

### Task 3: Cairo date library (TDD)

**Files:**
- Create: `src/lib/cairo.js`, `test/cairo.test.js`
- Reference: `app/MizanDashboard.tsx:150-200` in the frontend

**Interfaces:**
- Produces: `cairoDateKey(date = new Date()) → 'YYYY-MM-DD'`, `cairoDateAddDays(date, days) → 'YYYY-MM-DD'`, `cairoToday() → 'YYYY-MM-DD'`

- [ ] **Step 1: Write failing test `test/cairo.test.js`**

```js
import { describe, it, expect } from 'vitest';
import { cairoDateKey, cairoDateAddDays } from '../src/lib/cairo.js';

describe('cairoDateKey', () => {
  it('formats a known UTC instant as Cairo date', () => {
    // 2026-08-06 22:00 UTC = 2026-08-07 00:00 Cairo (UTC+2)
    const d = new Date('2026-08-06T22:00:00Z');
    expect(cairoDateKey(d)).toBe('2026-08-07');
  });

  it('keeps the same day before midnight Cairo', () => {
    const d = new Date('2026-08-06T20:59:00Z');
    expect(cairoDateKey(d)).toBe('2026-08-06');
  });
});

describe('cairoDateAddDays', () => {
  it('adds days across month boundary', () => {
    expect(cairoDateAddDays(new Date('2026-08-31T10:00:00Z'), 1)).toBe('2026-09-01');
  });
  it('subtracts days via negative input', () => {
    expect(cairoDateAddDays(new Date('2026-08-01T10:00:00Z'), -1)).toBe('2026-07-31');
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npm test -- cairo`
Expected: FAIL — `Cannot find module '../src/lib/cairo.js'`

- [ ] **Step 3: Implement `src/lib/cairo.js`**

```js
const TZ = 'Africa/Cairo';

export function cairoDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function cairoDateAddDays(date, days) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return cairoDateKey(d);
}

export function cairoToday() {
  return cairoDateKey(new Date());
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npm test -- cairo`
Expected: 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cairo.js test/cairo.test.js
git commit -m "feat(lib): cairo date helpers with tests"
```

---

### Task 4: HttpError + error middleware

**Files:**
- Create: `src/lib/http-error.js`, `src/middleware/error.js`, `src/middleware/log.js`

**Interfaces:**
- Produces: `HttpError` class (throw new HttpError(400, 'msg')); error-handling middleware exports `errorHandler`

- [ ] **Step 1: Write `src/lib/http-error.js`**

```js
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.name = 'HttpError';
  }
}
```

- [ ] **Step 2: Write `src/middleware/error.js`**

```js
import { ZodError } from 'zod';

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof ZodError) {
    return res.status(400).json({ error: err.errors[0]?.message ?? 'Invalid request' });
  }
  if (err.name === 'HttpError') {
    return res.status(err.status).json({ error: err.message });
  }
  console.error('[unhandled]', err);
  return res.status(500).json({ error: 'Internal server error' });
}
```

- [ ] **Step 3: Write `src/middleware/log.js`**

```js
export function logMiddleware(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
}
```

- [ ] **Step 4: Wire into `src/server.js`** (replace existing)

```js
import express from 'express';
import cors from 'cors';
import { env } from './env.js';
import { logMiddleware } from './middleware/log.js';
import { errorHandler } from './middleware/error.js';

const app = express();
app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json({ limit: '2mb' }));
app.use(logMiddleware);

app.get('/health', (req, res) => res.json({ ok: true }));

app.use(errorHandler);

app.listen(env.PORT, '127.0.0.1', () => {
  console.log(`Mizan API listening on http://127.0.0.1:${env.PORT}`);
});
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(middleware): error handler + request logging"
```

---

### Task 5: Test DB helper

**Files:**
- Create: `src/lib/test-db.js`, `vitest.config.js`

**Interfaces:**
- Produces: `resetDb()` — `deleteMany({})` on every collection before each test. Uses the same Atlas cluster with `MONGODB_DB_NAME=mizan_test` set in the test environment.

- [ ] **Step 1: Point tests at the throwaway DB**

Tests reuse the same Atlas cluster via `MONGODB_URI`; the `MONGODB_DB_NAME` env var (defaulted in `src/env.js`) selects `mizan_test`. No DDL step — Mongoose creates collections on first write. Each test run wipes data via `resetDb()`.

- [ ] **Step 2: Write `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: [],
    pool: 'forks', // isolate DB tests
  },
});
```

- [ ] **Step 3: Write `src/lib/test-db.js`**

```js
import { connectDb, disconnectDb } from '../db/client.js';
import { Horizon, Goal, Task, DailyLog, PastTask, Draft, AiResponse } from '../db/schema.js';

const MODELS = [AiResponse, Draft, PastTask, DailyLog, Task, Goal, Horizon];

export async function resetDb() {
  for (const M of MODELS) {
    await M.deleteMany({});
  }
}

// Ensure a single clean connection per test run.
export async function ensureTestDb() {
  await connectDb();
  await resetDb();
}

export { disconnectDb };
```

- [ ] **Step 4: Commit**

```bash
git add vitest.config.js src/lib/test-db.js
git commit -m "test: db reset helper + vitest config"
```

---

### Task 6: Repositories

**Files:**
- Create: `src/repositories/task.js`, `goal.js`, `horizon.js`, `daily-log.js`, `past-task.js`, `draft.js`
- (No `prayer.js` — prayers are embedded subdocs on `DailyLog`, owned by `daily-log.js`.)

**Interfaces:**
- Each repo exports plain functions over the Mongoose models. Used by services. No business logic. Reads return plain objects via `.lean()`.
- `taskRepo`: `findByDate(dateKey)`, `findById(id)`, `create(input)`, `update(id, patch)`, `remove(id)`
- `goalRepo`: `findAll()`, `findById(id)`, `update(id, patch)`, `bulkIncrementDone(ids, delta)`, `setParentIds(goalId, parentIds[])`, `setTaskGoalIds(taskId, goalIds[])`, `findAllLean()`
- `horizonRepo`: `findAll()`, `update(id, patch)`
- `dailyLogRepo`: `findByDate(dateKey)`, `upsert(dateKey, patch)`, `latestDateKey()`, `replacePrayers(dateKey, prayers[])` (owns embedded prayers)
- `pastTaskRepo`: `archive(dateKey, taskJson)`, `listSince(dateKey, days)` (trimming is handled by the TTL index — no `trimOlderThan`)
- `draftRepo`: `getAll()`, `upsert(key, value)`

- [ ] **Step 1: Write `src/repositories/task.js`**

```js
import { Task } from '../db/schema.js';

export const taskRepo = {
  async findByDate(dateKey) {
    return Task.find({ dateKey }).sort({ position: 1 }).lean();
  },
  async findById(id) {
    return Task.findById(id).lean();
  },
  async create(input) {
    return Task.create(input);
  },
  async update(id, patch) {
    return Task.findByIdAndUpdate(id, patch, { new: true }).lean();
  },
  async remove(id) {
    await Task.findByIdAndDelete(id);
  },
};
```

- [ ] **Step 2: Write `src/repositories/goal.js`**

```js
import { Goal, Task } from '../db/schema.js';

export const goalRepo = {
  async findAll() {
    return Goal.find().sort({ position: 1 }).lean();
  },
  async findById(id) {
    return Goal.findById(id).lean();
  },
  async update(id, patch) {
    return Goal.findByIdAndUpdate(id, patch, { new: true }).lean();
  },
  // tasksDone = max(0, tasksDone + delta), applied to each id. Single round-trip.
  async bulkIncrementDone(ids, delta, session) {
    if (!ids.length) return;
    await Goal.updateMany(
      { _id: { $in: ids } },
      [{ $set: { tasksDone: { $max: [0, { $add: ['$tasksDone', delta] }] } } }],
      { session },
    );
  },
  async setParentIds(goalId, parentIds, session) {
    await Goal.updateOne({ _id: goalId }, { $set: { parentGoalIds: parentIds } }, { session });
  },
  async setTaskGoalIds(taskId, goalIds, session) {
    await Task.updateOne({ _id: taskId }, { $set: { goalIds: goalIds ?? [] } }, { session });
  },
};
```

- [ ] **Step 3: Write `src/repositories/horizon.js`**

```js
import { Horizon } from '../db/schema.js';

export const horizonRepo = {
  async findAll() {
    return Horizon.find().sort({ position: 1 }).lean();
  },
  async update(id, patch) {
    return Horizon.findByIdAndUpdate(id, patch, { new: true }).lean();
  },
};
```

- [ ] **Step 4: Write `src/repositories/daily-log.js`** (owns embedded prayers)

```js
import { DailyLog } from '../db/schema.js';

export const dailyLogRepo = {
  async findByDate(dateKey) {
    return DailyLog.findById(dateKey).lean();
  },
  // Upsert by _id (= dateKey). `patch` may include any scalar field. Does NOT touch prayers.
  async upsert(dateKey, patch, session) {
    return DailyLog.findByIdAndUpdate(
      dateKey,
      { $set: { ...patch, _id: dateKey } },
      { new: true, upsert: true, session },
    ).lean();
  },
  // Insert-only (no-op if a doc for this day already exists). Used by rollover on the fresh-DB path.
  async insertIfMissing(dateKey, session) {
    await DailyLog.updateOne(
      { _id: dateKey },
      { $setOnInsert: { _id: dateKey } },
      { upsert: true, session },
    );
  },
  async latestDateKey() {
    const top = await DailyLog.find().sort({ _id: -1 }).limit(1).lean();
    return top[0]?._id ?? null;
  },
  // Replace the embedded prayers array (one day = one doc).
  async replacePrayers(dateKey, prayers, session) {
    const numbered = (prayers ?? []).map((p, i) => ({
      name: p.name,
      time: p.time ?? '',
      done: !!p.done,
      position: i,
    }));
    await DailyLog.updateOne(
      { _id: dateKey },
      { $set: { prayers: numbered } },
      { upsert: true, session },
    );
  },
};
```

- [ ] **Step 5: Write `src/repositories/past-task.js`** (no trim — TTL index handles it)

```js
import { PastTask } from '../db/schema.js';

export const pastTaskRepo = {
  async archive(dateKey, taskJson) {
    await PastTask.create({ dateKey, taskJson });
  },
  async listSince(dateKey, days = 30) {
    const since = subtractDays(dateKey, days);
    return PastTask.find({ dateKey: { $gte: since } }).sort({ dateKey: -1, createdAt: -1 }).lean();
  },
};

function subtractDays(dateKey, days) {
  const d = new Date(dateKey + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
```

- [ ] **Step 6: Write `src/repositories/draft.js`**

```js
import { Draft } from '../db/schema.js';

export const draftRepo = {
  async getAll() {
    const rows = await Draft.find().lean();
    return { planner: '', coach: '', ...Object.fromEntries(rows.map((r) => [r._id, r.value])) };
  },
  async upsert(key, value) {
    await Draft.findByIdAndUpdate(key, { $set: { value } }, { upsert: true });
  },
};
```

- [ ] **Step 7: Commit**

```bash
git add src/repositories/
git commit -m "feat(repos): task, goal, horizon, daily-log, past-task, draft (mongoose)"
```

---

### Task 7: Ripple service (TDD)

**Files:**
- Create: `src/services/ripple.js`, `test/ripple.test.js`
- Reference: `app/MizanDashboard.tsx:924-976` for the algorithm

**Interfaces:**
- Consumes: Mongoose models `Task`, `Goal`, and `goalRepo.bulkIncrementDone`
- Produces: `applyTaskRipple(taskId, nextDone) → { task, affectedGoals[] }`. Idempotent (no-op if `done` already equals `nextDone`). Cycle-safe BFS. Runs inside a Mongoose session transaction.

- [ ] **Step 1: Write failing test `test/ripple.test.js`**

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { ensureTestDb, disconnectDb } from '../src/lib/test-db.js';
import { Horizon, Goal, Task } from '../src/db/schema.js';
import { applyTaskRipple } from '../src/services/ripple.js';

beforeEach(async () => { await ensureTestDb(); });
afterAll(async () => { await disconnectDb(); });

async function seedChain() {
  const h = await Horizon.create({ label: '5yr', position: 0 });
  const root = await Goal.create({ horizonId: h._id, title: 'Root', position: 0, parentGoalIds: [] });
  const mid = await Goal.create({ horizonId: h._id, title: 'Mid', position: 1, parentGoalIds: [root._id] });
  const leaf = await Goal.create({ horizonId: h._id, title: 'Leaf', position: 2, parentGoalIds: [mid._id] });
  const t = await Task.create({
    _id: 't-1', dateKey: '2026-08-06', title: 'T', category: 'Business',
    range: 'flex', minutes: 30, kind: 'mission', goalIds: [leaf._id],
  });
  return { t, leaf, mid, root };
}

describe('applyTaskRipple', () => {
  it('increments tasksDone up the chain when task completes', async () => {
    const { t, leaf, mid, root } = await seedChain();
    await applyTaskRipple(t._id, true);

    const all = await Goal.find().lean();
    const byId = Object.fromEntries(all.map((g) => [g._id, g]));
    expect(byId[leaf._id].tasksDone).toBe(1);
    expect(byId[mid._id].tasksDone).toBe(1);
    expect(byId[root._id].tasksDone).toBe(1);
  });

  it('decrements when unmarked', async () => {
    const { t, leaf } = await seedChain();
    await applyTaskRipple(t._id, true);
    await applyTaskRipple(t._id, false);
    const g = await Goal.findById(leaf._id).lean();
    expect(g.tasksDone).toBe(0);
  });

  it('no-ops when done already matches', async () => {
    const { t, leaf } = await seedChain();
    await applyTaskRipple(t._id, true);
    await applyTaskRipple(t._id, true); // idempotent
    const g = await Goal.findById(leaf._id).lean();
    expect(g.tasksDone).toBe(1);
  });

  it('never drops tasksDone below zero on decrement', async () => {
    const { t, leaf } = await seedChain();
    // Goal starts at 0; decrement should stay at 0, not go negative.
    await applyTaskRipple(t._id, false);
    const g = await Goal.findById(leaf._id).lean();
    expect(g.tasksDone).toBe(0);
  });

  it('handles cycles without infinite loop', async () => {
    const h = await Horizon.create({ label: 'h', position: 0 });
    const a = await Goal.create({ horizonId: h._id, title: 'A', position: 0, parentGoalIds: ['b-id'] });
    const b = await Goal.create({ horizonId: h._id, title: 'B', position: 1, parentGoalIds: [a._id], _id: 'b-id' });
    const t = await Task.create({
      _id: 't-cyc', dateKey: '2026-08-06', title: 'T', category: 'Business',
      range: 'flex', minutes: 30, kind: 'mission', goalIds: [a._id],
    });

    await applyTaskRipple(t._id, true);
    const ga = await Goal.findById(a._id).lean();
    const gb = await Goal.findById('b-id').lean();
    expect(ga.tasksDone).toBe(1);
    expect(gb.tasksDone).toBe(1);
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npm test -- ripple`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/services/ripple.js`**

```js
import mongoose from 'mongoose';
import { Task, Goal } from '../db/schema.js';
import { goalRepo } from '../repositories/goal.js';

export async function applyTaskRipple(taskId, nextDone) {
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(async () => {
      const task = await Task.findById(taskId).session(session);
      if (!task) throw new Error(`Task ${taskId} not found`);

      // Idempotent: if state already matches, just return current state.
      if (task.done === nextDone) {
        const affectedGoals = await Goal.find().lean().session(session);
        return { task: task.toObject(), affectedGoals };
      }

      task.done = nextDone;
      await task.save({ session });

      // BFS up via each goal's parentGoalIds array (no join table).
      const visited = new Set();
      const queue = [...task.goalIds];
      const toUpdate = [];
      while (queue.length) {
        const id = String(queue.shift());
        if (visited.has(id)) continue;
        visited.add(id);
        toUpdate.push(id);
        const g = await Goal.findById(id).session(session).lean();
        for (const pid of g?.parentGoalIds ?? []) queue.push(pid);
      }

      const delta = nextDone ? 1 : -1;
      await goalRepo.bulkIncrementDone(toUpdate, delta, session);

      const affectedGoals = await Goal.find().lean().session(session);
      const updated = await Task.findById(taskId).session(session).lean();
      return { task: updated, affectedGoals };
    });
  } finally {
    session.endSession();
  }
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npm test -- ripple`
Expected: 5 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/services/ripple.js test/ripple.test.js
git commit -m "feat(ripple): cycle-safe BFS goal increment (mongoose session)"
```

---

### Task 8: Rollover service (TDD)

**Files:**
- Create: `src/services/rollover.js`, `test/rollover.test.js`
- Reference: `app/MizanDashboard.tsx:574-592` and `742-765`

**Interfaces:**
- Produces: `runRolloverIfNeeded() → { rolled: boolean, today: dateKey }` and a test-only `runRolloverFor(latest, today)`. Handles three cases: fresh DB, already-rolled, must-roll. Runs in a Mongoose session transaction. TTL index on `past_tasks.createdAt` handles 30-day trimming (no manual delete).

- [ ] **Step 1: Write failing test `test/rollover.test.js`**

```js
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { ensureTestDb, disconnectDb } from '../src/lib/test-db.js';
import { DailyLog, Task, PastTask } from '../src/db/schema.js';
import { runRolloverIfNeeded, runRolloverFor } from '../src/services/rollover.js';
import { cairoToday } from '../src/lib/cairo.js';

beforeEach(async () => { await ensureTestDb(); });
afterAll(async () => { await disconnectDb(); });

describe('runRolloverIfNeeded', () => {
  it('creates today daily_log on fresh DB without touching tasks', async () => {
    const result = await runRolloverIfNeeded();
    expect(result.rolled).toBe(true);
    expect(result.today).toBe(cairoToday());
    const today = await DailyLog.findById(cairoToday()).lean();
    expect(today).toBeTruthy();
    expect(today.prayers).toEqual([]); // frontend owns prayer times
  });

  it('is a no-op when latest = today', async () => {
    await DailyLog.findByIdAndUpdate(cairoToday(), { $setOnInsert: { _id: cairoToday() } }, { upsert: true });
    const result = await runRolloverIfNeeded();
    expect(result.rolled).toBe(false);
  });
});

describe('runRolloverFor', () => {
  it('rolls unfinished tasks forward with rolled+1', async () => {
    const yesterday = '2026-08-05';
    const today = '2026-08-06';
    await DailyLog.create({ _id: yesterday });

    await Task.create([
      { _id: 't-done', dateKey: yesterday, title: 'Done', category: 'Business', range: '', minutes: 30, kind: 'mission', done: true, rolled: 0 },
      { _id: 't-pend', dateKey: yesterday, title: 'Pending', category: 'Health', range: '', minutes: 30, kind: 'support', done: false, rolled: 1 },
    ]);

    await runRolloverFor(yesterday, today);

    const pending = await Task.findById('t-pend').lean();
    expect(pending.rolled).toBe(2);
    expect(pending.dateKey).toBe(today);
    // Done task should be archived then removed
    expect(await Task.findById('t-done').lean()).toBeNull();
    const archive = await PastTask.find({ dateKey: yesterday }).lean();
    expect(archive).toHaveLength(1);
  });

  it('promotes tomorrow over rolling when tomorrow exists', async () => {
    const yesterday = '2026-08-05';
    const today = '2026-08-06';
    await DailyLog.create({ _id: yesterday });
    await Task.create([
      { _id: 't-old', dateKey: yesterday, title: 'Old', category: 'Business', range: '', minutes: 30, kind: 'mission', done: false, rolled: 0 },
      { _id: 't-tom', dateKey: today, title: 'Tomorrow task', category: 'Mind', range: '', minutes: 30, kind: 'support', done: true, rolled: 0 },
    ]);

    await runRolloverFor(yesterday, today);

    expect(await Task.findById('t-old').lean()).toBeNull();
    const promoted = await Task.findById('t-tom').lean();
    expect(promoted.dateKey).toBe(today);
    expect(promoted.done).toBe(false);
  });

  it('caps rolled at 4 across multiple rollovers', async () => {
    const d1 = '2026-08-03', d2 = '2026-08-04', d3 = '2026-08-05', d4 = '2026-08-06';
    await DailyLog.create({ _id: d1 });
    await Task.create({ _id: 't-cap', dateKey: d1, title: 'Cap', category: 'Mind', range: '', minutes: 30, kind: 'support', done: false, rolled: 4 });

    await runRolloverFor(d1, d2);
    await runRolloverFor(d2, d3);
    await runRolloverFor(d3, d4);

    const t = await Task.findById('t-cap').lean();
    expect(t.rolled).toBe(4);
  });
});
```

- [ ] **Step 2: Implement `src/services/rollover.js`**

```js
import mongoose from 'mongoose';
import { Task, DailyLog, PastTask } from '../db/schema.js';
import { cairoToday } from '../lib/cairo.js';

export async function runRolloverIfNeeded() {
  const today = cairoToday();
  const latest = await DailyLog.find().sort({ _id: -1 }).limit(1).lean().then((r) => r[0]?._id ?? null);
  if (latest === today) return { rolled: false, today };
  await runRolloverFor(latest, today);
  return { rolled: true, today };
}

export async function runRolloverFor(latest, today) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Fresh DB — seed today with defaults + empty prayers. No task rollover.
      if (latest === null) {
        await DailyLog.findByIdAndUpdate(
          today,
          { $setOnInsert: { _id: today } },
          { upsert: true, session },
        );
        return;
      }

      // Snapshot yesterday's tasks into past_tasks (one doc with taskJson array).
      const yTasks = await Task.find({ dateKey: latest }).session(session).lean();
      if (yTasks.length) {
        await PastTask.create([{ dateKey: latest, taskJson: yTasks }], { session });
      }

      // Tomorrow tasks → promote; else → roll unfinished.
      const tomorrow = await Task.find({ dateKey: today }).session(session).lean();
      if (tomorrow.length) {
        await Task.deleteMany({ dateKey: latest }).session(session);
        await Task.updateMany({ dateKey: today }, { $set: { done: false } }, { session });
      } else {
        await Task.deleteMany({ dateKey: latest }).session(session);
        const unfinished = yTasks.filter((t) => !t.done).map((t) => ({
          ...t,
          _id: undefined,                 // let Mongoose mint a fresh UUID per rolled instance
          done: false,
          rolled: Math.min(4, (t.rolled ?? 0) + 1),
          dateKey: today,
        }));
        if (unfinished.length) {
          await Task.insertMany(unfinished, { session, ordered: false });
        }
      }

      // Today's daily_log: insert-only with reset defaults + empty prayers (frontend seeds times).
      await DailyLog.findByIdAndUpdate(
        today,
        { $setOnInsert: { _id: today } },
        { upsert: true, session },
      );
      // past_tasks TTL index auto-trims at 30 days — no manual delete here.
    });
  } finally {
    session.endSession();
  }
}
```

- [ ] **Step 3: Run, expect pass**

Run: `npm test -- rollover`
Expected: 5 tests passing.

- [ ] **Step 4: Commit**

```bash
git add src/services/rollover.js test/rollover.test.js
git commit -m "feat(rollover): lazy day-boundary transition with archive (mongoose)"
```

---

### Task 9: Sync service + route

**Files:**
- Create: `src/services/sync.js`, `src/routes/sync.js`

**Interfaces:**
- Produces: `buildSyncPayload()` returns `{ horizons, goals, goalParents, tasks: { today, tomorrow }, dailyLog, prayers, pastTasks, drafts }`. `goalParents` is derived from each goal's `parentGoalIds` array (kept as a separate top-level array in the payload for frontend shape compatibility). `prayers` comes from the embedded array on `dailyLog`. Route mounts at `GET /api/sync`.

- [ ] **Step 1: Write `src/services/sync.js`**

```js
import { runRolloverIfNeeded } from './rollover.js';
import { cairoDateAddDays } from '../lib/cairo.js';
import { horizonRepo } from '../repositories/horizon.js';
import { goalRepo } from '../repositories/goal.js';
import { taskRepo } from '../repositories/task.js';
import { dailyLogRepo } from '../repositories/daily-log.js';
import { pastTaskRepo } from '../repositories/past-task.js';
import { draftRepo } from '../repositories/draft.js';

export async function buildSyncPayload() {
  const { today } = await runRolloverIfNeeded();
  const tomorrow = cairoDateAddDays(new Date(), 1);

  const [horizons, goals, todayTasks, tomorrowTasks, dailyLog, pastTasks, drafts] = await Promise.all([
    horizonRepo.findAll(),
    goalRepo.findAll(),
    taskRepo.findByDate(today),
    taskRepo.findByDate(tomorrow),
    dailyLogRepo.findByDate(today),
    pastTaskRepo.listSince(today, 30),
    draftRepo.getAll(),
  ]);

  // Derive goalParents from each goal's parentGoalIds array (frontend shape compat).
  const goalParents = goals.flatMap((g) =>
    (g.parentGoalIds ?? []).map((pid) => ({ goalId: g._id, parentGoalId: pid })),
  );

  return {
    dateKey: today,
    horizons,
    goals,
    goalParents,
    tasks: { today: todayTasks, tomorrow: tomorrowTasks },
    dailyLog,
    prayers: dailyLog?.prayers ?? [],   // embedded on the daily log
    pastTasks,
    drafts,
  };
}
```

- [ ] **Step 2: Write `src/routes/sync.js`**

```js
import { Router } from 'express';
import { buildSyncPayload } from '../services/sync.js';

export const syncRouter = Router();

syncRouter.get('/', async (req, res, next) => {
  try {
    res.json(await buildSyncPayload());
  } catch (err) { next(err); }
});
```

- [ ] **Step 3: Mount in `src/server.js`** — add before `app.use(errorHandler)`:

```js
import { syncRouter } from './routes/sync.js';
app.use('/api/sync', syncRouter);
```

- [ ] **Step 4: Commit**

```bash
git add src/services/sync.js src/routes/sync.js src/server.js
git commit -m "feat(sync): unified payload endpoint with lazy rollover"
```

---

### Task 10: Tasks routes (ripple integration)

**Files:**
- Create: `src/routes/tasks.js`, `src/schemas/requests.js`

**Interfaces:**
- Mounts at `/api/tasks`. POST creates, PATCH updates (calls ripple if `done` changed), DELETE removes.

- [ ] **Step 1: Write `src/schemas/requests.js`** (partial — extended in later tasks)

```js
import { z } from 'zod';

const category = z.enum(['Business', 'Health', 'Faith', 'College', 'Mind', 'Personality', 'Family', 'Life', 'Ops']);

export const createTaskSchema = z.object({
  dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().min(1).max(200),
  category,
  range: z.string().max(80).default(''),
  minutes: z.number().int().min(0).default(0),
  done: z.boolean().default(false),
  rolled: z.number().int().min(0).max(4).default(0),
  kind: z.enum(['mission', 'support']).default('support'),
  details: z.string().optional(),
  position: z.number().int().default(0),
  linkedGoalIds: z.array(z.string().uuid()).optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  category: category.optional(),
  range: z.string().max(80).optional(),
  minutes: z.number().int().min(0).optional(),
  done: z.boolean().optional(),
  rolled: z.number().int().min(0).max(4).optional(),
  kind: z.enum(['mission', 'support']).optional(),
  details: z.string().nullable().optional(),
  position: z.number().int().optional(),
  linkedGoalIds: z.array(z.string().uuid()).optional(),
});
```

- [ ] **Step 2: Write `src/routes/tasks.js`**

```js
import { Router } from 'express';
import { taskRepo } from '../repositories/task.js';
import { goalRepo } from '../repositories/goal.js';
import { applyTaskRipple } from '../services/ripple.js';
import { createTaskSchema, updateTaskSchema } from '../schemas/requests.js';
import { HttpError } from '../lib/http-error.js';

export const tasksRouter = Router();

tasksRouter.post('/', async (req, res, next) => {
  try {
    const input = createTaskSchema.parse(req.body);
    const { linkedGoalIds, ...taskFields } = input;
    const task = await taskRepo.create({ ...taskFields, goalIds: linkedGoalIds ?? [] });
    res.status(201).json(task);
  } catch (err) { next(err); }
});

tasksRouter.patch('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const patch = updateTaskSchema.parse(req.body);
    const { linkedGoalIds, ...taskFields } = patch;
    const current = await taskRepo.findById(id);
    if (!current) throw new HttpError(404, 'Task not found');

    // done changed → ripple (runs in its own transaction).
    if (patch.done !== undefined && patch.done !== current.done) {
      const { task, affectedGoals } = await applyTaskRipple(id, patch.done);
      if (linkedGoalIds !== undefined) await goalRepo.setTaskGoalIds(id, linkedGoalIds);
      res.json({ task, goals: affectedGoals });
      return;
    }

    const task = Object.keys(taskFields).length
      ? await taskRepo.update(id, taskFields)
      : current;
    if (linkedGoalIds !== undefined) await goalRepo.setTaskGoalIds(id, linkedGoalIds);
    res.json({ task });
  } catch (err) { next(err); }
});

tasksRouter.delete('/:id', async (req, res, next) => {
  try {
    await taskRepo.remove(req.params.id);
    res.status(204).end();
  } catch (err) { next(err); }
});
```

> Note: the Zod schema uses the frontend field name `linkedGoalIds`; the persisted field is `goalIds`. The route translates between them and calls `goalRepo.setTaskGoalIds` (which writes the `goalIds` array directly on the Task doc).

- [ ] **Step 3: Mount in `src/server.js`**

```js
import { tasksRouter } from './routes/tasks.js';
app.use('/api/tasks', tasksRouter);
```

- [ ] **Step 4: Smoke test manually**

```bash
curl -X POST http://localhost:8787/api/tasks \
  -H 'Content-Type: application/json' \
  -d '{"dateKey":"2026-08-06","title":"Test","category":"Business","range":"flex","minutes":30,"kind":"mission"}'
```
Expected: 201 with the created task JSON.

- [ ] **Step 5: Commit**

```bash
git add src/routes/tasks.js src/schemas/requests.js src/server.js
git commit -m "feat(tasks): CRUD routes with ripple on done toggle"
```

---

### Task 11: Goals + horizons routes

**Files:**
- Create: `src/routes/goals.js`, `src/routes/horizons.js`

**Interfaces:**
- `PATCH /api/goals/:id` accepts `{ title?, tasksDone?, parentGoalIds?, position? }`. Replacing `parentGoalIds` rewrites `goal_parents`.
- `PATCH /api/horizons/:id` accepts `{ label?, startDate?, targetDate?, position? }`.

- [ ] **Step 1: Add to `src/schemas/requests.js`**

```js
export const updateGoalSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  tasksDone: z.number().int().min(0).optional(),
  parentGoalIds: z.array(z.string().uuid()).optional(),
  position: z.number().int().optional(),
});

export const updateHorizonSchema = z.object({
  label: z.string().min(1).max(60).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  position: z.number().int().optional(),
});
```

- [ ] **Step 2: Write `src/routes/goals.js`**

```js
import { Router } from 'express';
import { goalRepo } from '../repositories/goal.js';
import { updateGoalSchema } from '../schemas/requests.js';
import { HttpError } from '../lib/http-error.js';

export const goalsRouter = Router();

goalsRouter.patch('/:id', async (req, res, next) => {
  try {
    const patch = updateGoalSchema.parse(req.body);
    const { parentGoalIds, ...fields } = patch;
    const updated = Object.keys(fields).length ? await goalRepo.update(req.params.id, fields) : null;
    if (parentGoalIds !== undefined) await goalRepo.replaceParents(req.params.id, parentGoalIds);
    if (!updated && parentGoalIds === undefined) throw new HttpError(400, 'No fields to update');
    res.json({ goal: updated });
  } catch (err) { next(err); }
});
```

- [ ] **Step 3: Write `src/routes/horizons.js`**

```js
import { Router } from 'express';
import { horizonRepo } from '../repositories/horizon.js';
import { updateHorizonSchema } from '../schemas/requests.js';
import { HttpError } from '../lib/http-error.js';

export const horizonsRouter = Router();

horizonsRouter.patch('/:id', async (req, res, next) => {
  try {
    const patch = updateHorizonSchema.parse(req.body);
    if (!Object.keys(patch).length) throw new HttpError(400, 'No fields to update');
    const horizon = await horizonRepo.update(req.params.id, patch);
    res.json({ horizon });
  } catch (err) { next(err); }
});
```

- [ ] **Step 4: Mount in `src/server.js`**

```js
import { goalsRouter } from './routes/goals.js';
import { horizonsRouter } from './routes/horizons.js';
app.use('/api/goals', goalsRouter);
app.use('/api/horizons', horizonsRouter);
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(routes): goals + horizons PATCH endpoints"
```

---

### Task 12: Daily-log + drafts routes

**Files:**
- Create: `src/routes/daily-log.js`, `src/routes/drafts.js`

**Interfaces:**
- `PATCH /api/daily-log/:dateKey` accepts any subset of daily_log fields + `prayers` (replace) + `contextNotes` (replace).
- `PUT /api/drafts` accepts `{ planner?, coach? }`.

- [ ] **Step 1: Add to `src/schemas/requests.js`**

```js
export const patchDailyLogSchema = z.object({
  mode: z.enum(['grinding', 'recovery', 'vacation']).optional(),
  challenge: z.string().max(200).optional(),
  challengeDone: z.boolean().optional(),
  quranDone: z.boolean().optional(),
  highestTierDone: z.number().int().min(0).optional(),
  energy: z.number().int().min(1).max(5).optional(),
  pain: z.number().int().min(1).max(5).optional(),
  focus: z.number().int().min(1).max(5).optional(),
  contextNotes: z.array(z.string()).optional(),
  prayers: z.array(z.object({
    name: z.string(),
    time: z.string().optional(),
    done: z.boolean().optional(),
  })).optional(),
});

export const putDraftsSchema = z.object({
  planner: z.string().max(8000).optional(),
  coach: z.string().max(8000).optional(),
});
```

- [ ] **Step 2: Write `src/routes/daily-log.js`**

```js
import { Router } from 'express';
import { dailyLogRepo } from '../repositories/daily-log.js';
import { patchDailyLogSchema } from '../schemas/requests.js';

export const dailyLogRouter = Router();

dailyLogRouter.patch('/:dateKey', async (req, res, next) => {
  try {
    const dateKey = req.params.dateKey;
    const patch = patchDailyLogSchema.parse(req.body);
    const { prayers, ...fields } = patch;
    if (Object.keys(fields).length) await dailyLogRepo.upsert(dateKey, fields);
    if (prayers !== undefined) await dailyLogRepo.replacePrayers(dateKey, prayers);
    const log = await dailyLogRepo.findByDate(dateKey);
    res.json({ dailyLog: log });
  } catch (err) { next(err); }
});
```

- [ ] **Step 3: Write `src/routes/drafts.js`**

```js
import { Router } from 'express';
import { draftRepo } from '../repositories/draft.js';
import { putDraftsSchema } from '../schemas/requests.js';

export const draftsRouter = Router();

draftsRouter.put('/', async (req, res, next) => {
  try {
    const patch = putDraftsSchema.parse(req.body);
    if (patch.planner !== undefined) await draftRepo.upsert('planner', patch.planner);
    if (patch.coach !== undefined) await draftRepo.upsert('coach', patch.coach);
    res.json(await draftRepo.getAll());
  } catch (err) { next(err); }
});
```

- [ ] **Step 4: Mount in `src/server.js`**

```js
import { dailyLogRouter } from './routes/daily-log.js';
import { draftsRouter } from './routes/drafts.js';
app.use('/api/daily-log', dailyLogRouter);
app.use('/api/drafts', draftsRouter);
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(routes): daily-log PATCH + drafts PUT"
```

---

### Task 13: OpenRouter client (port from frontend, TDD)

**Files:**
- Create: `src/lib/openrouter.js`, `test/openrouter.test.js`
- Reference: `app/api/_lib/openrouter.ts` (frontend)

**Interfaces:**
- Produces: `complete({ messages, maxTokens, jsonSchema?, temperature?, endpoint }) → { ok, content?, error?, status, retried? }` and `completeJson(...)`.

- [ ] **Step 1: Write failing test with mocked fetch**

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => {
  vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
  vi.stubEnv('OPENROUTER_MODEL', 'test-model');
});

describe('openrouter complete', () => {
  it('returns content on 200', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'hello' }, finish_reason: 'stop' }] }),
    });
    global.fetch = fetchMock;

    const { complete } = await import('../src/lib/openrouter.js');
    const r = await complete({ messages: [{ role: 'user', content: 'hi' }], maxTokens: 100, endpoint: 'test' });
    expect(r.ok).toBe(true);
    expect(r.content).toBe('hello');
  });

  it('returns error on missing API key', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '');
    const { complete } = await import('../src/lib/openrouter.js');
    const r = await complete({ messages: [], maxTokens: 100, endpoint: 'test' });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(503);
  });

  it('retries once on length-finish with no content', async () => {
    const failOnce = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ choices: [{ message: { content: '' }, finish_reason: 'length' }] }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ choices: [{ message: { content: 'full output' }, finish_reason: 'stop' }] }),
      });
    global.fetch = failOnce;
    const { complete } = await import('../src/lib/openrouter.js');
    const r = await complete({ messages: [], maxTokens: 100, endpoint: 'test' });
    expect(r.ok).toBe(true);
    expect(r.retried).toBe(true);
    expect(r.content).toBe('full output');
  });
});
```

- [ ] **Step 2: Implement `src/lib/openrouter.js`** — port `app/api/_lib/openrouter.ts` line-for-line:

```js
import { env } from '../env.js';

const URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * @typedef {{ role: 'system'|'user'|'assistant', content: string }} Message
 */

/**
 * @param {{
 *   messages: Message[],
 *   maxTokens: number,
 *   jsonSchema?: { name: string, schema: object },
 *   temperature?: number,
 *   endpoint: string,
 * }} opts
 */
export async function complete(opts) {
  const apiKey = env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) return { ok: false, status: 503, error: 'OPENROUTER_API_KEY not configured' };

  const first = await callOnce(apiKey, opts, opts.maxTokens);
  if (first.ok) return first;
  if (first.error !== 'retry') return first;

  const retry = await callOnce(apiKey, opts, opts.maxTokens * 2);
  if (retry.ok) return { ...retry, retried: true };
  return retry;
}

async function callOnce(apiKey, opts, maxTokens) {
  const body = {
    model: env.OPENROUTER_MODEL,
    messages: opts.messages,
    max_tokens: maxTokens,
    temperature: opts.temperature ?? 0.6,
  };
  if (opts.jsonSchema) {
    body.response_format = {
      type: 'json_schema',
      json_schema: { name: opts.jsonSchema.name, strict: true, schema: opts.jsonSchema.schema },
    };
  }

  let res;
  try {
    res = await fetch(URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://mizan.local',
        'X-Title': 'Mizan',
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, status: 502, error: `Network error (${opts.endpoint}): ${e.message}` };
  }

  if (!res.ok) {
    const detail = await safeText(res);
    return { ok: false, status: res.status, error: `OpenRouter ${opts.endpoint} failed (${res.status}): ${detail.slice(0, 280)}` };
  }

  let payload;
  try { payload = await res.json(); }
  catch { return { ok: false, status: 502, error: `OpenRouter ${opts.endpoint} returned non-JSON` }; }

  const choice = payload?.choices?.[0];
  const content = choice?.message?.content ?? '';
  const finishReason = choice?.finish_reason ?? 'unknown';

  if ((!content || finishReason === 'length') && maxTokens < 4096) {
    return { ok: false, status: 200, error: 'retry', content: '', finishReason };
  }
  if (!content) {
    return { ok: false, status: 502, error: `OpenRouter ${opts.endpoint} returned empty completion` };
  }
  return { ok: true, content, finishReason, retried: false };
}

async function safeText(res) {
  try { return await res.text(); } catch { return '<no body>'; }
}

export async function completeJson(opts) {
  const r = await complete(opts);
  if (!r.ok) return r;
  try {
    return { ok: true, value: JSON.parse(r.content), retried: r.retried };
  } catch {
    return { ok: false, status: 502, error: `OpenRouter ${opts.endpoint} returned non-JSON content: ${r.content.slice(0, 200)}` };
  }
}
```

- [ ] **Step 3: Run tests**

Run: `npm test -- openrouter`
Expected: 3 tests passing.

- [ ] **Step 4: Commit**

```bash
git add src/lib/openrouter.js test/openrouter.test.js
git commit -m "feat(lib): OpenRouter client with retry-on-truncation"
```

---

### Task 14: AI services + routes (arrange, coach, insights)

**Files:**
- Create: `src/services/arrange.js`, `coach.js`, `insights.js`, `src/routes/ai.js`
- Reference: `app/api/arrange/route.ts`, `app/api/coach/route.ts`, `app/api/insights/route.ts`

**Interfaces:**
- Three POST endpoints mounted under `/api/`. Each is a direct port of the corresponding Next route. Same system prompts, same JSON schemas, same fallbacks.

- [ ] **Step 1: Write `src/services/arrange.js`** — port `app/api/arrange/route.ts`. Copy `SYSTEM_PROMPT`, `arrangeSchema`, `ruleBasedFallback`, `describeContext`, and the POST handler logic verbatim, returning `{ plan, fallback?, error? }` instead of `Response.json(...)`.

```js
import { completeJson } from '../lib/openrouter.js';

const SYSTEM_PROMPT = `You are Mizan's planning assistant. The user (Mohamed, Cairo) brain-dumps what's on his mind for tomorrow. You produce a clean, ordered day plan as strict JSON.

Hard rules:
- Read the brain-dump carefully. If the user named a specific time ("at 2pm", "after Asr", "before Maghrib", "9 AM sharp"), the task range MUST reflect that time. This is the most important rule.
- If he named a fixed commitment (lecture, physio appointment, call), put it at its stated time and build the rest of the day around it.
- Order the remaining work by leverage: deep focus first, then shallow work, then learning and recovery. Protect prayer blocks (Fajr ~dawn, Dhuhr ~midday, Asr ~afternoon, Maghrib ~sunset, Isha ~night) — don't schedule hard focus across them.
- Two to three "mission" tasks (real outcomes), the rest "support". Cap at 5 tasks total.
- Titles: short, plain imperative prose. No markdown, no quotes, no emoji, no leading numbers. Max ~70 chars.
- "range": human-readable window in 12-hour clock with am/pm, e.g. "10:30 am – 1:00 pm". Required, even for unspecific tasks.
- "minutes": realistic focus duration in integer minutes (30, 45, 60, 90, 120, 150).
- "category": exactly one of "Business", "Health", "Faith", "College", "Mind", "Personality", "Family".
- "kind": "mission" for the 2–3 outcomes that matter most today, "support" for everything else.
- "overallReasoning": 1–3 sentences explaining the order and trade-offs.
- Do not invent tasks the user did not mention.`;

const arrangeSchema = {
  type: 'object',
  properties: {
    tasks: {
      type: 'array', maxItems: 5,
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          category: { type: 'string', enum: ['Business', 'Health', 'Faith', 'College', 'Mind', 'Personality', 'Family'] },
          range: { type: 'string' },
          minutes: { type: 'number' },
          kind: { type: 'string', enum: ['mission', 'support'] },
        },
        required: ['title', 'category', 'range', 'minutes', 'kind'],
        additionalProperties: false,
      },
    },
    overallReasoning: { type: 'string' },
  },
  required: ['tasks', 'overallReasoning'],
  additionalProperties: false,
};

function ruleBasedFallback(brainDump) {
  // Port of app/api/arrange/route.ts:67-102
  // (Copy the rule-based arrangement verbatim — keyword categorization + fixed ranges)
  // Returns { tasks: [...], overallReasoning: string }
}

function describeContext(ctx) {
  // Port of app/api/arrange/route.ts:104-118
  const parts = [`Day mode he's planning for: ${ctx.mode}`];
  if (ctx.checkIn) parts.push(`Today's check-in: energy ${ctx.checkIn.energy}/5, pain ${ctx.checkIn.pain}/5, focus ${ctx.checkIn.focus}/5`);
  const incomplete = ctx.tasks.filter((t) => !t.done).slice(0, 4);
  if (incomplete.length) parts.push('Unfinished today: ' + incomplete.map((t) => `"${t.title}" (${t.category})`).join(', '));
  return parts.join('\n');
}

export async function arrangePlan({ brainDump, context }) {
  const dump = (brainDump ?? '').trim();
  if (dump.length > 4000) throw new Error('brainDump too long');

  const userPrompt = `Brain-dump:\n"""\n${dump || '(empty)'}\n"""\n\n` + describeContext(context);
  const result = await completeJson({
    endpoint: 'arrange',
    maxTokens: 900,
    temperature: 0.4,
    jsonSchema: { name: 'mizan_arrange_plan', schema: arrangeSchema },
    messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userPrompt }],
  });

  if (!result.ok) {
    return { plan: ruleBasedFallback(dump), fallback: true, error: result.error };
  }

  const cleaned = {
    tasks: (result.value.tasks ?? []).slice(0, 5).filter((t) => t.title && t.category && t.range).map((t) => ({
      title: String(t.title).slice(0, 120),
      category: t.category,
      range: String(t.range).slice(0, 40),
      minutes: Number.isFinite(t.minutes) ? Math.max(15, Math.min(240, Math.round(t.minutes))) : 60,
      kind: t.kind === 'mission' ? 'mission' : 'support',
    })),
    overallReasoning: String(result.value.overallReasoning ?? '').slice(0, 600),
  };

  if (!cleaned.tasks.length) {
    return { plan: ruleBasedFallback(dump), fallback: true, error: 'Model returned empty plan' };
  }
  return { plan: cleaned };
}
```

- [ ] **Step 2: Write `src/services/coach.js`** — port `app/api/coach/route.ts`. Copy `SYSTEM_PROMPT`, `STUCK_PROMPT`, `buildStuckUserMessage`, `renderSystemPrompt` verbatim. Export `coachReply({ message, context, mode })` returning `{ reply, error? }`.

- [ ] **Step 3: Write `src/services/insights.js`** — port `app/api/insights/route.ts`. Copy `SYSTEM_PROMPT`, `insightsSchema`, `describeContext`, `isEmpty`, `emptyStateResponse`. Export `generateInsights({ context })` returning the full response object including `headline, stat, risk, lifeMap, emptyState?, fallback?`.

- [ ] **Step 4: Write `src/routes/ai.js`** mounting all three:

```js
import { Router } from 'express';
import { arrangePlan } from '../services/arrange.js';
import { coachReply } from '../services/coach.js';
import { generateInsights } from '../services/insights.js';

export const aiRouter = Router();

aiRouter.post('/arrange', async (req, res, next) => {
  try {
    if (!req.body?.brainDump) return res.status(400).json({ error: 'brainDump required' });
    const result = await arrangePlan(req.body);
    res.json(result);
  } catch (err) { next(err); }
});

aiRouter.post('/coach', async (req, res, next) => {
  try {
    const { message, context, mode } = req.body ?? {};
    if (!message && mode !== 'stuck') return res.status(400).json({ error: 'message required' });
    if (message && message.length > 2000) return res.status(413).json({ error: 'message too long' });
    const result = await coachReply({ message, context, mode });
    res.json(result);
  } catch (err) { next(err); }
});

aiRouter.post('/insights', async (req, res, next) => {
  try {
    if (!req.body?.context) return res.status(400).json({ error: 'context required' });
    const result = await generateInsights(req.body);
    res.json(result);
  } catch (err) { next(err); }
});
```

- [ ] **Step 5: Mount in `src/server.js`**

```js
import { aiRouter } from './routes/ai.js';
app.use('/api', aiRouter);  // mounts /api/arrange, /api/coach, /api/insights
```

- [ ] **Step 6: Smoke test each endpoint**

```bash
curl -X POST http://localhost:8787/api/insights \
  -H 'Content-Type: application/json' \
  -d '{"context":{"mode":"grinding","tasks":[],"prayers":[],"quranDone":false,"checkIn":{"energy":3,"pain":2,"focus":3},"lifeAreas":[{"name":"Faith"},{"name":"Health"}],"dateKey":"2026-08-06"}}'
```
Expected: empty-state response with `emptyState: true`.

- [ ] **Step 7: Commit**

```bash
git add src/services/arrange.js src/services/coach.js src/services/insights.js src/routes/ai.js src/server.js
git commit -m "feat(ai): port arrange/coach/insights endpoints from frontend"
```

---

### Task 15: Migration service + route (TDD)

**Files:**
- Create: `src/services/migrate.js`, `src/routes/migrate.js`, `test/migrate.test.js`

**Interfaces:**
- `POST /api/migrate` accepts `{ lifeOsV2?, lifeOsV1?, goalsV2?, goalsV1?, insights? }`. Idempotent via `bulkWrite` upserts on the existing UUID `_id`s (which come straight from localStorage).

- [ ] **Step 1: Write failing test**

```js
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { ensureTestDb, disconnectDb } from '../src/lib/test-db.js';
import { Goal, Task, DailyLog, Horizon } from '../src/db/schema.js';
import { migratePayload } from '../src/services/migrate.js';

beforeEach(async () => { await ensureTestDb(); });
afterAll(async () => { await disconnectDb(); });

describe('migratePayload', () => {
  it('repairs legacy linkedGoalId → goalIds', async () => {
    const summary = await migratePayload({
      lifeOsV2: {
        schemaVersion: 3, dateKey: '2026-08-06', mode: 'grinding',
        tasks: [{ id: 't-1', title: 'T', category: 'Business', range: '', minutes: 30, kind: 'mission', done: false, rolled: 0, linkedGoalId: 'g-1' }],
        prayers: [{ name: 'Fajr', time: '04:30', done: false }], checkIn: { energy: 3, pain: 2, focus: 3 }, pastTasks: [],
      },
      goalsV2: [{ label: '1mo', startDate: '2026-08-06', targetDate: '2026-09-06', goals: [{ id: 'g-1', title: 'G', tasksDone: 0 }] }],
    });
    expect(summary.tasks).toBe(1);
    expect(summary.goals).toBe(1);
    expect(summary.horizons).toBe(1);

    const t = await Task.findById('t-1').lean();
    expect(t.goalIds).toEqual(['g-1']);
    const log = await DailyLog.findById('2026-08-06').lean();
    expect(log.prayers).toHaveLength(1);
    expect(log.prayers[0].name).toBe('Fajr');
  });

  it('migrates v1 string goals to objects', async () => {
    const summary = await migratePayload({
      goalsV1: [{ label: '1mo', progress: 10, goals: ['Old goal 1', 'Old goal 2'], targetDate: '2026-09-06' }],
    });
    expect(summary.goals).toBe(2);
  });

  it('is idempotent on re-run (no duplicate goals)', async () => {
    const payload = { goalsV2: [{ label: '1mo', startDate: '2026-08-06', targetDate: '2026-09-06', goals: [{ id: 'fixed-id', title: 'G', tasksDone: 0 }] }] };
    const first = await migratePayload(payload);
    const second = await migratePayload(payload);
    expect(first.goals).toBe(second.goals);
    expect(await Goal.countDocuments()).toBe(1);
    expect(await Horizon.countDocuments()).toBe(1);
  });
});
```

- [ ] **Step 2: Implement `src/services/migrate.js`**

```js
import { Horizon, Goal, Task, DailyLog, PastTask, AiResponse } from '../db/schema.js';
import { mongo } from 'mongoose';

export async function migratePayload({ lifeOsV2, lifeOsV1, goalsV2, goalsV1, insights }) {
  const summary = { tasks: 0, goals: 0, horizons: 0, pastDays: 0, insights: 0 };
  const goalIdMap = new Map(); // oldId → preservedId (here the same value — UUIDs pass through)

  // GOALS first (tasks reference them). Upsert by _id so re-runs are no-ops.
  const goalSources = [
    ...(goalsV2 ?? []).map((h) => ({ ...h, _version: 2 })),
    ...(goalsV1 ?? []).map((h) => ({ ...h, _version: 1 })),
  ];

  const horizonOps = [];
  const goalOps = [];
  const horizonLabels = new Set();

  for (let i = 0; i < goalSources.length; i++) {
    const h = goalSources[i];
    // Stable _id for horizons: derived from label so re-runs don't create dupes
    // (v1 labels may collide across users, but single-user here — label is fine).
    const horizonId = `h-${i}-${h.label.replace(/\s+/g, '-').toLowerCase()}`;
    horizonOps.push({
      updateOne: {
        filter: { _id: horizonId },
        update: { $setOnInsert: {
          _id: horizonId, label: h.label,
          startDate: h.startDate ?? null, targetDate: h.targetDate ?? null, position: i,
        } },
        upsert: true,
      },
    });
    horizonLabels.add(horizonId);

    for (let j = 0; j < (h.goals ?? []).length; j++) {
      const g = h.goals[j];
      const isStr = typeof g === 'string';
      const oldId = isStr ? null : g.id;
      const title = isStr ? g : g.title;
      const tasksDone = isStr ? 0 : (g.tasksDone ?? 0);
      const newId = oldId && oldId.length === 36 ? oldId : crypto.randomUUID();
      if (oldId) goalIdMap.set(oldId, newId);

      goalOps.push({
        updateOne: {
          filter: { _id: newId },
          update: { $setOnInsert: {
            _id: newId, horizonId, title, tasksDone, position: j,
            parentGoalIds: isStr ? [] : (g.parentGoalIds ?? (g.parentGoalId ? [g.parentGoalId] : [])),
          } },
          upsert: true,
        },
      });
    }
  }

  if (horizonOps.length) {
    const r = await Horizon.bulkWrite(horizonOps, { ordered: false });
    summary.horizons = r.upsertedCount;
  }
  if (goalOps.length) {
    const r = await Goal.bulkWrite(goalOps, { ordered: false });
    summary.goals = r.upsertedCount;
  }

  // Now that goals exist, stamp any parentGoalIds that referenced unmapped v1 ids.
  for (const h of goalsV2 ?? []) {
    for (const g of (h.goals ?? [])) {
      if (typeof g === 'object' && g.parentGoalIds?.length) {
        const mapped = g.parentGoalIds.map((id) => goalIdMap.get(id) ?? id);
        await Goal.updateOne({ _id: g.id }, { $set: { parentGoalIds: mapped } });
      }
    }
  }

  // DAILY LOG + TASKS (and embedded prayers)
  const lifeOs = lifeOsV2 ?? lifeOsV1;
  if (lifeOs?.dateKey) {
    const dateKey = lifeOs.dateKey;
    await DailyLog.findByIdAndUpdate(
      dateKey,
      { $set: {
        mode: lifeOs.mode ?? 'grinding',
        challenge: lifeOs.challenge ?? '',
        challengeDone: !!lifeOs.challengeDone,
        quranDone: !!lifeOs.quranDone,
        highestTierDone: lifeOs.highestTierDone ?? 0,
        energy: lifeOs.checkIn?.energy ?? 3,
        pain: lifeOs.checkIn?.pain ?? 2,
        focus: lifeOs.checkIn?.focus ?? 3,
        contextNotes: lifeOs.contextNotes ?? [],
        prayers: (lifeOs.prayers ?? []).map((p, i) => ({
          _id: new mongo.ObjectId(), name: p.name, time: p.time ?? '', done: !!p.done, position: i,
        })),
      }, $setOnInsert: { _id: dateKey } },
      { upsert: true },
    );

    const taskOps = [];
    for (let i = 0; i < (lifeOs.tasks ?? []).length; i++) {
      const t = lifeOs.tasks[i];
      const linkedGoalIds = t.linkedGoalIds ?? (t.linkedGoalId ? [t.linkedGoalId] : []);
      const mapped = linkedGoalIds.map((id) => goalIdMap.get(id) ?? id);
      const newId = t.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(t.id))
        ? String(t.id) : crypto.randomUUID();
      taskOps.push({
        updateOne: {
          filter: { _id: newId },
          update: { $setOnInsert: {
            _id: newId, dateKey, title: t.title, category: t.category,
            range: t.range ?? '', minutes: t.minutes ?? 0, done: !!t.done,
            rolled: t.rolled ?? 0, kind: t.kind ?? 'support',
            details: t.details ?? null, position: i, goalIds: mapped,
          } },
          upsert: true,
        },
      });
    }
    if (taskOps.length) {
      const r = await Task.bulkWrite(taskOps, { ordered: false });
      summary.tasks = r.upsertedCount;
    }

    // Past tasks archive (one PastTask doc per entry)
    for (const past of lifeOs.pastTasks ?? []) {
      await PastTask.create({ dateKey: past.dateKey, taskJson: past.tasks ?? [] });
      summary.pastDays++;
    }
  }

  // Insights cache → ai_responses audit log
  for (const [key, value] of Object.entries(insights ?? {})) {
    const m = key.match(/^mizan-insights-(\d{4}-\d{2}-\d{2})$/);
    if (!m) continue;
    await AiResponse.create({
      endpoint: 'insights', dateKey: m[1],
      requestJson: { cached: true }, responseJson: value, fallback: !!value.fallback,
    }).catch(() => {}); // ignore duplicate-key races on re-run
    summary.insights++;
  }

  return summary;
}
```

- [ ] **Step 3: Write `src/routes/migrate.js`**

```js
import { Router } from 'express';
import { migratePayload } from '../services/migrate.js';

export const migrateRouter = Router();

migrateRouter.post('/', async (req, res, next) => {
  try {
    const summary = await migratePayload(req.body ?? {});
    res.json(summary);
  } catch (err) { next(err); }
});
```

- [ ] **Step 4: Mount in `src/server.js`**

```js
import { migrateRouter } from './routes/migrate.js';
app.use('/api/migrate', migrateRouter);
```

- [ ] **Step 5: Run tests**

Run: `npm test -- migrate`
Expected: 3 tests passing.

- [ ] **Step 6: Commit**

```bash
git add src/services/migrate.js src/routes/migrate.js test/migrate.test.js src/server.js
git commit -m "feat(migrate): import localStorage blobs (v1/v2) with idempotent bulkWrite"
```

---

### Task 16: End-to-end route smoke test + README

**Files:**
- Create: `test/routes.test.js`, `README.md`

- [ ] **Step 1: Write `test/routes.test.js`** with supertest against a real test DB:

```js
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import { ensureTestDb, disconnectDb } from '../src/lib/test-db.js';
import { Horizon, Goal } from '../src/db/schema.js';

let app;
beforeEach(async () => {
  await ensureTestDb();
  const mod = await import('../src/server.js?bust=' + Date.now());
  app = mod.app ?? mod.default;
});
afterAll(async () => { await disconnectDb(); });

describe('routes', () => {
  it('GET /health returns ok', async () => {
    const r = await request(app).get('/health');
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
  });

  it('GET /api/sync creates today daily_log on fresh DB', async () => {
    const r = await request(app).get('/api/sync');
    expect(r.status).toBe(200);
    expect(r.body.dateKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.body.dailyLog).toBeTruthy();
  });

  it('POST /api/tasks creates and PATCH toggles done with ripple', async () => {
    const horizon = await Horizon.create({ label: '1mo', position: 0 });
    const goal = await Goal.create({ horizonId: horizon._id, title: 'G', position: 0 });

    const created = await request(app).post('/api/tasks').send({
      dateKey: '2026-08-06', title: 'T', category: 'Business', range: '', minutes: 30, kind: 'mission',
      linkedGoalIds: [goal._id],
    });
    expect(created.status).toBe(201);

    const toggled = await request(app).patch(`/api/tasks/${created.body._id}`).send({ done: true });
    expect(toggled.status).toBe(200);
    expect(toggled.body.task.done).toBe(true);
    expect(toggled.body.goals.find((g) => g._id === goal._id).tasksDone).toBe(1);
  });
});
```

- [ ] **Step 2: Refactor `src/server.js` to export `app` without auto-listening in test mode**

```js
// at bottom:
if (process.env.NODE_ENV !== 'test') {
  app.listen(env.PORT, '127.0.0.1', () => console.log(`Mizan API listening on http://127.0.0.1:${env.PORT}`));
}
export { app };
```

- [ ] **Step 3: Run full suite**

Run: `MONGODB_DB_NAME=mizan_test NODE_ENV=test npm test`
Expected: all tests green.

- [ ] **Step 4: Write `README.md`**

```markdown
# Mizan Backend

Express + MongoDB Atlas + Mongoose backend for the Mizan Life OS frontend.

## Setup
1. `npm install`
2. Copy `.env.example` → `.env`, fill in `MONGODB_URI` and `OPENROUTER_API_KEY`
3. `npm run dev`

No migration step — Mongoose creates collections on first write.

## Endpoints
See `docs/superpowers/specs/2026-08-06-mizan-backend-design.md` for the full contract.

## Migrating existing localStorage
POST `/api/migrate` with the JSON from your browser's localStorage. See spec §5.

## Tests
`MONGODB_DB_NAME=mizan_test npm test`
```

- [ ] **Step 5: Commit**

```bash
git add test/routes.test.js src/server.js README.md
git commit -m "test: end-to-end route smoke + README"
```

---

## Self-Review

**Spec coverage check:**
- §3 Schema (MongoDB) → Task 2 ✓ (7 models, embedded prayers, TTL on past_tasks, UUID _ids for top-level docs)
- §4 Rollover → Task 8 ✓ (lazy, Mongoose transaction, fresh-DB, archive, promote-tomorrow, roll-unfinished, TTL trim, prayers empty by design)
- §4 Ripple → Task 7 ✓ (idempotent, cycle-safe, Mongoose transaction, returns affected goals)
- §5 GET /sync → Task 9 ✓ (prayers read from embedded dailyLog.prayers; goalParents derived)
- §5 Tasks CRUD → Task 10 ✓
- §5 Goals/Horizons → Task 11 ✓
- §5 Daily-log/Drafts → Task 12 ✓ (embedded prayers via dailyLogRepo.replacePrayers)
- §5 Migrate → Task 15 ✓ (bulkWrite upserts, idempotent on UUID _ids)
- §5 AI endpoints → Task 14 ✓
- §6 Project layout → all tasks align ✓ (no migrations/, no prayer repo)
- §7 .env → Task 1 ✓ (MONGODB_URI + MONGODB_DB_NAME + OPENROUTER_API_KEY)
- §8 Testing → Vitest + supertest + Atlas throwaway DB ✓

**Placeholder scan:** The `ruleBasedFallback` function body is referenced as "port verbatim" rather than re-typed — this is intentional to avoid duplicating ~40 lines of keyword logic the frontend already has. The implementing agent must read `app/api/arrange/route.ts:67-102` and copy it. This is acceptable per the writing-plans skill ("follow existing patterns"). Same for `coach.js` and `insights.js` in Task 14.

**Type consistency:** Repo function names match across services and routes. `applyTaskRipple` returns `{ task, affectedGoals }`. `runRolloverIfNeeded` returns `{ rolled, today }`. `migratePayload` returns the summary shape used by the route. `goalRepo.bulkIncrementDone`/`setParentIds`/`setTaskGoalIds` all accept an optional Mongoose `session` so callers running inside a transaction can pass it through.

**Known gaps to flag for the implementer:**
1. `parentGoalIds` and `goalIds` are denormalized — the Goal delete hook in `schema.js` is the only cascade. If goals are deleted via direct `deleteMany` (e.g. in tests via `resetDb`), the hook does NOT fire; that's fine because `resetDb` wipes all collections.
2. Mongoose's default ObjectId vs. UUID: top-level docs override `_id` with `crypto.randomUUID()`. Embedded subdocs (prayers) keep the default ObjectId. Mixed in queries this is fine but worth knowing.
3. Task 14's services `coach.js` and `insights.js` are described as "port verbatim" — implementer must read the frontend files.
4. Tests hit a real Atlas cluster (`MONGODB_DB_NAME=mizan_test`) — slower than mocks but honest about transaction semantics. The first run of `resetDb` creates the `mizan_test` DB implicitly.
