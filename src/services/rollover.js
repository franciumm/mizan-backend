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
  let timings = null;
  try {
    const res = await fetch('http://api.aladhan.com/v1/timingsByCity?city=Cairo&country=Egypt');
    const data = await res.json();
    timings = data?.data?.timings;
  } catch (err) {
    // Ignore fetch errors, fallback to empty strings
  }

  const prayers = [
    { name: 'Fajr', time: timings?.Fajr || '' },
    { name: 'Dhuhr', time: timings?.Dhuhr || '' },
    { name: 'Asr', time: timings?.Asr || '' },
    { name: 'Maghrib', time: timings?.Maghrib || '' },
    { name: 'Isha', time: timings?.Isha || '' },
  ];

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Fresh DB — seed today with defaults
      if (latest === null) {
        await DailyLog.findByIdAndUpdate(
          today,
          { $setOnInsert: { _id: today, prayers } },
          { upsert: true, session },
        );
        return;
      }

      // Snapshot yesterday's tasks into past_tasks
      const yTasks = await Task.find({ dateKey: latest }).session(session).lean();
      if (yTasks.length) {
        await PastTask.create([{ dateKey: latest, taskJson: yTasks }], { session });
      }

      // Build unfinished list from snapshot before deleting
      const unfinished = yTasks.filter((t) => !t.done).map((t) => ({
        ...t,
        _id: undefined,
        done: false,
        rolled: Math.min(4, (t.rolled ?? 0) + 1),
        dateKey: today,
      }));

      await Task.deleteMany({ dateKey: latest }).session(session);

      // Tomorrow tasks → promote; also roll unfinished.
      const tomorrow = await Task.find({ dateKey: today }).session(session).lean();
      if (tomorrow.length) {
        await Task.updateMany({ dateKey: today }, { $set: { done: false } }, { session });
      }

      if (unfinished.length) {
        await Task.insertMany(unfinished, { session, ordered: false });
      }

      // Today's daily_log: insert-only with prayers
      await DailyLog.findByIdAndUpdate(
        today,
        { $setOnInsert: { _id: today, prayers } },
        { upsert: true, session },
      );
    });
  } finally {
    session.endSession();
  }
}
