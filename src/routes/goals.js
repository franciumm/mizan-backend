import { Router } from 'express';
import mongoose from 'mongoose';
import { goalRepo } from '../repositories/goal.js';
import { Goal } from '../db/schema.js';
import { recomputeAllGoalCounts } from '../services/recompute.js';
import { updateGoalSchema } from '../schemas/requests.js';
import { HttpError } from '../lib/http-error.js';

export const goalsRouter = Router();

goalsRouter.patch('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const patch = updateGoalSchema.parse(req.body);
    const { parentGoalIds, ...fields } = patch;
    if (!Object.keys(fields).length && parentGoalIds === undefined) {
      throw new HttpError(400, 'No fields to update');
    }

    const session = await mongoose.startSession();
    let resultGoal;
    await session.withTransaction(async () => {
      const goal = await Goal.findById(id).session(session);
      if (!goal) throw new HttpError(404, 'Goal not found');

      if (parentGoalIds !== undefined) {
        goal.parentGoalIds = parentGoalIds;
      }
      for (const [k, v] of Object.entries(fields)) {
        goal[k] = v;
      }
      await goal.save({ session });

      if (parentGoalIds !== undefined) {
        await recomputeAllGoalCounts(session);
      }

      resultGoal = await Goal.findById(id).session(session).lean();
    });
    session.endSession();

    res.json({ goal: resultGoal });
  } catch (err) { next(err); }
});
