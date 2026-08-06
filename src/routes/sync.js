import { Router } from 'express';
import { buildSyncPayload } from '../services/sync.js';

export const syncRouter = Router();

syncRouter.get('/', async (req, res, next) => {
  try {
    res.json(await buildSyncPayload());
  } catch (err) { next(err); }
});
