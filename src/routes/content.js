import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z, ZodError } from 'zod';
import seed from '../content/seed.json' with { type: 'json' };
import { ContentAsset, ContentSettings } from '../content/models.js';
import { assetSchema, settingsSchema } from '../content/schema.js';

export const contentRouter = Router();
const record = doc => ({ ...doc.data, _id: doc._id, revision: doc.revision });
const route = fn => async (req, res, next) => {
  try { await fn(req, res); } catch (error) {
    if (error instanceof ZodError) return res.status(400).json({ error: error.issues[0]?.message || 'Invalid content record' });
    next(error);
  }
};

contentRouter.get('/', route(async (_req, res) => {
  const [assets, settings] = await Promise.all([ContentAsset.find().sort({ _id: 1 }).lean(), ContentSettings.findById('content-os').lean()]);
  res.json({ assets: assets.map(record), settings: settings ? record(settings) : { ...settingsSchema.parse({}), _id: 'content-os', revision: 0 }, initialized: !!settings });
}));

// Stable IDs and insert-only writes make repeat imports safe for edited records.
contentRouter.post('/initialize', route(async (_req, res) => {
  await ContentAsset.bulkWrite(seed.map(({ _id, ...data }) => ({ updateOne: { filter: { _id }, update: { $setOnInsert: { data: assetSchema.parse(data), revision: 0 } }, upsert: true } })));
  await ContentSettings.updateOne({ _id: 'content-os' }, { $setOnInsert: { data: settingsSchema.parse({ firstRecordingDate: '2026-09-11', notes: 'Initial plan: 2–3 hours for the first recording session; normal days 1–2 hours. Friend editing for approximately one month, with delivery in under three days. Publishing start is not set.' }), revision: 0 } }, { upsert: true });
  res.json({ imported: seed.length });
}));

contentRouter.put('/settings', route(async (req, res) => {
  const { revision, data } = z.object({ revision: z.number().int().nonnegative(), data: settingsSchema }).strict().parse(req.body);
  const updated = await ContentSettings.findOneAndUpdate({ _id: 'content-os', revision }, { $set: { data }, $inc: { revision: 1 } }, { new: true }).lean();
  if (!updated) return res.status(409).json({ error: 'Settings changed elsewhere. Reload before saving again.' });
  res.json(record(updated));
}));

contentRouter.post('/assets', route(async (req, res) => {
  const data = assetSchema.parse(req.body);
  const asset = await ContentAsset.create({ _id: randomUUID(), data, revision: 0 });
  res.status(201).json(record(asset));
}));

contentRouter.put('/assets/:id', route(async (req, res) => {
  const { revision, data } = z.object({ revision: z.number().int().nonnegative(), data: assetSchema }).strict().parse(req.body);
  const asset = await ContentAsset.findOneAndUpdate({ _id: req.params.id, revision }, { $set: { data }, $inc: { revision: 1 } }, { new: true }).lean();
  if (!asset) return res.status(409).json({ error: 'This idea changed elsewhere or is no longer available. Close and reload before editing again.' });
  res.json(record(asset));
}));
