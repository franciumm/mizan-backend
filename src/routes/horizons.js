import { Router } from 'express';
import { horizonRepo } from '../repositories/horizon.js';
import { updateHorizonSchema } from '../schemas/requests.js';
import { HttpError } from '../lib/http-error.js';

export const horizonsRouter = Router();

horizonsRouter.patch('/:id', async (req, res, next) => {
  try {
    const patch = updateHorizonSchema.parse(req.body);
    if (!Object.keys(patch).length) throw new HttpError(400, 'No fields to update');
    const horizon = await horizonRepo.update(req.params.id, patch);
    res.json({ horizon });
  } catch (err) { next(err); }
});
