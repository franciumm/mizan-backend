import { Router } from 'express';
import { migratePayload } from '../services/migrate.js';

export const migrateRouter = Router();

migrateRouter.post('/', async (req, res, next) => {
  try {
    const summary = await migratePayload(req.body ?? {});
    res.json(summary);
  } catch (err) { next(err); }
});
