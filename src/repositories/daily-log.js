import { DailyLog } from '../db/schema.js';

export const dailyLogRepo = {
  async findByDate(dateKey) {
    return DailyLog.findById(dateKey).lean();
  },
  async findLastNDays(endDateKey, n) {
    return DailyLog.find({ _id: { $lte: endDateKey } })
      .sort({ _id: -1 })
      .limit(n)
      .lean();
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
