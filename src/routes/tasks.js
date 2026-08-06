import { Router } from 'express';
import { taskRepo } from '../repositories/task.js';
import { goalRepo } from '../repositories/goal.js';
import { applyTaskRipple, applyRippleDelta } from '../services/ripple.js';
import mongoose from 'mongoose';
import { Task, Goal } from '../db/schema.js';
import { createTaskSchema, updateTaskSchema } from '../schemas/requests.js';
import { HttpError } from '../lib/http-error.js';

export const tasksRouter = Router();

tasksRouter.post('/', async (req, res, next) => {
  try {
    const input = createTaskSchema.parse(req.body);
    const { linkedGoalIds, ...taskFields } = input;
    const task = await taskRepo.create({ ...taskFields, goalIds: linkedGoalIds ?? [] });
    res.status(201).json(task);
  } catch (err) { next(err); }
});

tasksRouter.patch('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const patch = updateTaskSchema.parse(req.body);
    const { linkedGoalIds, ...taskFields } = patch;
    
    const session = await mongoose.startSession();
    let resultTask, affectedGoals;
    
    await session.withTransaction(async () => {
      const task = await Task.findById(id).session(session);
      if (!task) throw new HttpError(404, 'Task not found');

      const wasDone = task.done;
      const oldGoalIds = task.goalIds;

      if (patch.done !== undefined) task.done = patch.done;
      if (linkedGoalIds !== undefined) task.goalIds = linkedGoalIds;
      for (const [k, v] of Object.entries(taskFields)) {
        task[k] = v;
      }
      await task.save({ session });

      if (wasDone) await applyRippleDelta(oldGoalIds, -1, session);
      if (task.done) await applyRippleDelta(task.goalIds, 1, session);

      resultTask = await Task.findById(id).session(session).lean();
      affectedGoals = await Goal.find().session(session).lean();
    });
    session.endSession();
    
    res.json({ task: resultTask, goals: affectedGoals });
  } catch (err) { next(err); }
});

tasksRouter.delete('/:id', async (req, res, next) => {
  try {
    const session = await mongoose.startSession();
    await session.withTransaction(async () => {
      const task = await Task.findById(req.params.id).session(session);
      if (task) {
        if (task.done) await applyRippleDelta(task.goalIds, -1, session);
        await Task.findByIdAndDelete(task._id).session(session);
      }
    });
    session.endSession();
    res.status(204).end();
  } catch (err) { next(err); }
});
