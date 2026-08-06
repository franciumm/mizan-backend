import { Router } from 'express';
import { dailyLogRepo } from '../repositories/daily-log.js';
import { patchDailyLogSchema } from '../schemas/requests.js';

export const dailyLogRouter = Router();

dailyLogRouter.patch('/:dateKey', async (req, res, next) => {
  try {
    const dateKey = req.params.dateKey;
    const patch = patchDailyLogSchema.parse(req.body);
    const { prayers, ...fields } = patch;
    if (Object.keys(fields).length) await dailyLogRepo.upsert(dateKey, fields);
    if (prayers !== undefined) await dailyLogRepo.replacePrayers(dateKey, prayers);
    const log = await dailyLogRepo.findByDate(dateKey);
    res.json({ dailyLog: log });
  } catch (err) { next(err); }
});
