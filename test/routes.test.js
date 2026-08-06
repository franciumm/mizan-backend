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
