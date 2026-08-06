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
        // Build unfinished list from snapshot before deleting
        const unfinished = yTasks.filter((t) => !t.done).map((t) => ({
          ...t,
          _id: undefined,                 // let Mongoose mint a fresh UUID per rolled instance
          done: false,
          rolled: Math.min(4, (t.rolled ?? 0) + 1),
          dateKey: today,
        }));
        await Task.deleteMany({ dateKey: latest }).session(session);
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
