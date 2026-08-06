import { Router } from 'express';
import { goalRepo } from '../repositories/goal.js';
import { updateGoalSchema } from '../schemas/requests.js';
import { HttpError } from '../lib/http-error.js';

export const goalsRouter = Router();

goalsRouter.patch('/:id', async (req, res, next) => {
  try {
    const patch = updateGoalSchema.parse(req.body);
    const { parentGoalIds, ...fields } = patch;
    const updated = Object.keys(fields).length ? await goalRepo.update(req.params.id, fields) : null;
    if (parentGoalIds !== undefined) await goalRepo.replaceParents(req.params.id, parentGoalIds);
    if (!updated && parentGoalIds === undefined) throw new HttpError(400, 'No fields to update');
    res.json({ goal: updated ?? await goalRepo.findById(req.params.id) });
  } catch (err) { next(err); }
});
