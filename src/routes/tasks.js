import { Router } from 'express';
import { taskRepo } from '../repositories/task.js';
import { goalRepo } from '../repositories/goal.js';
import { applyTaskRipple } from '../services/ripple.js';
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
    const current = await taskRepo.findById(id);
    if (!current) throw new HttpError(404, 'Task not found');

    // done changed → ripple (runs in its own transaction).
    if (patch.done !== undefined && patch.done !== current.done) {
      const { task, affectedGoals } = await applyTaskRipple(id, patch.done);
      if (linkedGoalIds !== undefined) await goalRepo.setTaskGoalIds(id, linkedGoalIds);
      res.json({ task, goals: affectedGoals });
      return;
    }

    const task = Object.keys(taskFields).length
      ? await taskRepo.update(id, taskFields)
      : current;
    if (linkedGoalIds !== undefined) await goalRepo.setTaskGoalIds(id, linkedGoalIds);
    res.json({ task });
  } catch (err) { next(err); }
});

tasksRouter.delete('/:id', async (req, res, next) => {
  try {
    await taskRepo.remove(req.params.id);
    res.status(204).end();
  } catch (err) { next(err); }
});
