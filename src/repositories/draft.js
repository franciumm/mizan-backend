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
