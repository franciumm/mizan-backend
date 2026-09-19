import { Router } from 'express';
import { createHash } from 'node:crypto';
import { z, ZodError } from 'zod';
import { LifeOSRecord } from '../life-os/models.js';
import { dateKeySchema, emptyLifeOSStore, lifeOSStoreSchema } from '../life-os/schema.js';
import { calculateLifeOSProgress } from '../life-os/progress.js';

const route = fn => async (req, res, next) => {
  try { await fn(req, res); }
  catch (error) {
    if (error instanceof ZodError) return res.status(400).json({ error: error.issues[0]?.message || 'Invalid Life OS data.' });
    next(error);
  }
};
const workspaceKeySchema = z.string().regex(/^[A-Za-z0-9_-]{43,128}$/, 'Use a valid Life OS workspace key.');
function recordId(req, res) {
  const raw = req.get('x-mizan-workspace-key');
  if (!raw) { res.status(401).json({ error: 'A Life OS workspace key is required.' }); return null; }
  const key = workspaceKeySchema.parse(raw);
  return `life-os:${createHash('sha256').update(key).digest('hex')}`;
}
function cairoDateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
const response = (doc, throughDate) => {
  const store = lifeOSStoreSchema.parse(doc?.store || emptyLifeOSStore());
  return { store, revision: doc?.revision || 0, initialized: Boolean(doc), progress: calculateLifeOSProgress(store, throughDate) };
};

export function createLifeOSRouter(Records = LifeOSRecord) {
  const router = Router();
  router.get('/', route(async (req, res) => {
    const id = recordId(req, res); if (!id) return;
    const { through } = z.object({ through: dateKeySchema.optional() }).strict().parse(req.query);
    const doc = await Records.findById(id).lean();
    res.json(response(doc, through || cairoDateKey()));
  }));
  router.put('/', route(async (req, res) => {
    const id = recordId(req, res); if (!id) return;
    const { revision, store, through } = z.object({ revision: z.number().int().nonnegative(), store: lifeOSStoreSchema, through: dateKeySchema.optional() }).strict().parse(req.body);
    const existing = await Records.findById(id).lean();
    let saved;
    if (!existing && revision === 0) {
      try { saved = await Records.create({ _id: id, store, revision: 1 }); }
      catch (error) {
        if (error?.code === 11000) return res.status(409).json({ error: 'Life OS changed elsewhere. Reload before saving again.' });
        throw error;
      }
    } else {
      saved = await Records.findOneAndUpdate({ _id: id, revision }, { $set: { store }, $inc: { revision: 1 } }, { new: true, runValidators: true }).lean();
      if (!saved) return res.status(409).json({ error: 'Life OS changed elsewhere. Your local copy is safe; reload before saving again.' });
    }
    res.json(response(saved, through || cairoDateKey()));
  }));
  return router;
}
export const lifeOSRouter = createLifeOSRouter();
