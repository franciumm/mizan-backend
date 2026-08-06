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
