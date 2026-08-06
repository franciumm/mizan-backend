import { Goal, Task } from '../db/schema.js';

export const goalRepo = {
  async findAll() {
    return Goal.find().sort({ position: 1 }).lean();
  },
  async findById(id) {
    return Goal.findById(id).lean();
  },
  async update(id, patch) {
    return Goal.findByIdAndUpdate(id, patch, { new: true }).lean();
  },
  async bulkIncrementDone(ids, delta) {
    if (!ids.length) return;
    await Goal.updateMany(
      { _id: { $in: ids } },
      [{ $set: { tasksDone: { $max: [0, { $add: ['$tasksDone', delta] }] } } }],
    );
  },
  async setParentIds(goalId, parentIds, session) {
    await Goal.updateOne({ _id: goalId }, { $set: { parentGoalIds: parentIds } }, { session });
  },
  async setTaskGoalIds(taskId, goalIds, session) {
    await Task.updateOne({ _id: taskId }, { $set: { goalIds: goalIds ?? [] } }, { session });
  },
  // Replace the parentGoalIds array for a given goal (used by PATCH /goals/:id).
  async replaceParents(goalId, parentIds) {
    await Goal.updateOne({ _id: goalId }, { $set: { parentGoalIds: parentIds ?? [] } });
  },
};
