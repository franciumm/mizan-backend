import { Horizon } from '../db/schema.js';

export const horizonRepo = {
  async findAll() {
    return Horizon.find().sort({ position: 1 }).lean();
  },
  async update(id, patch) {
    return Horizon.findByIdAndUpdate(id, patch, { new: true }).lean();
  },
};
