import { Router } from 'express';
import { draftRepo } from '../repositories/draft.js';
import { putDraftsSchema } from '../schemas/requests.js';

export const draftsRouter = Router();

draftsRouter.put('/', async (req, res, next) => {
  try {
    const patch = putDraftsSchema.parse(req.body);
    if (patch.planner !== undefined) await draftRepo.upsert('planner', patch.planner);
    if (patch.coach !== undefined) await draftRepo.upsert('coach', patch.coach);
    res.json(await draftRepo.getAll());
  } catch (err) { next(err); }
});
