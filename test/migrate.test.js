import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { ensureTestDb, disconnectDb } from '../src/lib/test-db.js';
import { Goal, Task, DailyLog, Horizon } from '../src/db/schema.js';
import { migratePayload } from '../src/services/migrate.js';

beforeEach(async () => { await ensureTestDb(); });
afterAll(async () => { await disconnectDb(); });

describe('migratePayload', () => {
  it('repairs legacy linkedGoalId → goalIds', async () => {
    const tid = '12345678-1234-1234-1234-1234567890ab';
    const gid = 'abcdef01-1234-1234-1234-1234567890ab';
    const summary = await migratePayload({
      lifeOsV2: {
        schemaVersion: 3, dateKey: '2026-08-06', mode: 'grinding',
        tasks: [{ id: tid, title: 'T', category: 'Business', range: '', minutes: 30, kind: 'mission', done: false, rolled: 0, linkedGoalId: gid }],
        prayers: [{ name: 'Fajr', time: '04:30', done: false }], checkIn: { energy: 3, pain: 2, focus: 3 }, pastTasks: [],
      },
      goalsV2: [{ label: '1mo', startDate: '2026-08-06', targetDate: '2026-09-06', goals: [{ id: gid, title: 'G', tasksDone: 0 }] }],
    });
    expect(summary.tasks).toBe(1);
    expect(summary.goals).toBe(1);
    expect(summary.horizons).toBe(1);

    const t = await Task.findById(tid).lean();
    expect(t.goalIds).toEqual([gid]);
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
    const gid = 'abcdef01-1234-1234-1234-1234567890ab';
    const payload = { goalsV2: [{ label: '1mo', startDate: '2026-08-06', targetDate: '2026-09-06', goals: [{ id: gid, title: 'G', tasksDone: 0 }] }] };
    const first = await migratePayload(payload);
    const second = await migratePayload(payload);
    expect(first.goals).toBe(1);
    expect(second.goals).toBe(0);
    expect(await Goal.countDocuments()).toBe(1);
    expect(await Horizon.countDocuments()).toBe(1);
  });
});
