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
    expect(today.prayers).toHaveLength(5);
    expect(today.prayers[0].name).toBe('Fajr');
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

    // Unfinished task should have been re-created with rolled+1 (new _id, old one deleted)
    const pending = await Task.findOne({ title: 'Pending', dateKey: today }).lean();
    expect(pending).toBeTruthy();
    expect(pending.rolled).toBe(2);
    expect(pending.dateKey).toBe(today);
    // Done task should be archived then removed
    expect(await Task.findById('t-done').lean()).toBeNull();
    const archive = await PastTask.find({ dateKey: yesterday }).lean();
    expect(archive).toHaveLength(1);
  });

  it('promotes tomorrow and ALSO merges rolled tasks', async () => {
    const yesterday = '2026-08-05';
    const today = '2026-08-06';
    await DailyLog.create({ _id: yesterday });
    await Task.create([
      { _id: 't-old', dateKey: yesterday, title: 'Old', category: 'Business', range: '', minutes: 30, kind: 'mission', done: false, rolled: 0 },
      { _id: 't-tom', dateKey: today, title: 'Tomorrow task', category: 'Mind', range: '', minutes: 30, kind: 'support', done: true, rolled: 0 },
    ]);

    await runRolloverFor(yesterday, today);

    // Old unfinished task was merged, not dropped
    const merged = await Task.findOne({ title: 'Old' }).lean();
    expect(merged).toBeTruthy();
    expect(merged.dateKey).toBe(today);
    expect(merged.rolled).toBe(1);
    
    // Tomorrow task was promoted (done set to false)
    const promoted = await Task.findOne({ title: 'Tomorrow task' }).lean();
    expect(promoted).toBeTruthy();
    expect(promoted.dateKey).toBe(today);
    expect(promoted.done).toBe(false);
  });

  it('caps rolled at 4 across multiple rollovers', async () => {
    const d1 = '2026-08-03';
    await DailyLog.create({ _id: d1 });
    await Task.create({ _id: 't-cap', dateKey: d1, title: 'Cap', category: 'Mind', range: '', minutes: 30, kind: 'support', done: false, rolled: 3 });

    await runRolloverFor(d1, '2026-08-04');
    // After first roll: rolled = min(4, 3+1) = 4
    let t = await Task.findOne({ title: 'Cap' }).lean();
    expect(t.rolled).toBe(4);
    expect(t.dateKey).toBe('2026-08-04');

    await DailyLog.findByIdAndUpdate('2026-08-04', { $setOnInsert: { _id: '2026-08-04' } }, { upsert: true });
    await runRolloverFor('2026-08-04', '2026-08-05');
    t = await Task.findOne({ title: 'Cap' }).lean();
    expect(t.rolled).toBe(4); // capped
    expect(t.dateKey).toBe('2026-08-05');
  });
});
