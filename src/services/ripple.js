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
