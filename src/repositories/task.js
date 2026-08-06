import { Task } from '../db/schema.js';

export const taskRepo = {
  async findByDate(dateKey) {
    return Task.find({ dateKey }).sort({ position: 1 }).lean();
  },
  async findById(id) {
    return Task.findById(id).lean();
  },
  async create(input) {
    return Task.create(input);
  },
  async update(id, patch) {
    return Task.findByIdAndUpdate(id, patch, { new: true }).lean();
  },
  async remove(id) {
    await Task.findByIdAndDelete(id);
  },
};
