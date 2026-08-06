import { describe, it, expect, beforeEach, afterAll } from 'vitest';
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
