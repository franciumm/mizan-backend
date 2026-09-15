import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z, ZodError } from 'zod';
import { JourneyRecord } from '../journey/models.js';
import { eventSchema, playbookSchema, overviewSchema } from '../journey/schema.js';
import { journeySeed } from '../journey/seed.js';

const record = doc => ({ ...doc.data, _id: doc._id, revision: doc.revision });
const route = fn => async (req, res, next) => {
  try { await fn(req, res); }
  catch (error) {
    if (error instanceof ZodError) return res.status(400).json({ error: error.issues[0]?.message || 'Invalid journey record.' });
    next(error);
  }
};

export function createJourneyRouter(Records = JourneyRecord) {
  const router = Router();
  router.get('/', route(async (_req, res) => {
    const docs = await Records.find().lean();
    const overview = docs.find(d => d.kind === 'overview');
    res.json({ events: docs.filter(d => d.kind === 'event').map(record), playbooks: docs.filter(d => d.kind === 'playbook').map(record), overview: overview ? record(overview) : null, initialized: !!overview });
  }));
  router.post('/initialize', route(async (_req, res) => {
    await Records.bulkWrite(journeySeed.map(doc => ({ updateOne: { filter: { _id: doc._id }, update: { $setOnInsert: doc }, upsert: true } })));
    res.json({ imported: journeySeed.length });
  }));

  async function checkLinks(kind, id, data) {
    const ids = kind === 'event' ? data.parentIds : data.sourceEventIds || [];
    if (!ids.length) return '';
    const events = (await Records.find({ kind: 'event' }).lean()).filter(d => d.kind === 'event');
    const byId = new Map(events.map(e => [e._id, e.data.parentIds]));
    if (ids.some(ref => !byId.has(ref))) return 'A linked event is unavailable. Reload and choose an existing event.';
    if (kind !== 'event') return '';
    const seen = new Set();
    const reachesSelf = ref => {
      if (ref === id) return true;
      if (seen.has(ref)) return false;
      seen.add(ref);
      return (byId.get(ref) || []).some(reachesSelf);
    };
    return ids.some(reachesSelf) ? 'An event cannot lead back to itself. Check the events that prompted it.' : '';
  }

  for (const [path, kind, schema] of [['events', 'event', eventSchema], ['playbooks', 'playbook', playbookSchema]]) {
    router.post(`/${path}`, route(async (req, res) => {
      const data = schema.parse(req.body);
      const id = randomUUID();
      const error = await checkLinks(kind, id, data);
      if (error) return res.status(400).json({ error });
      res.status(201).json(record(await Records.create({ _id: id, kind, data, revision: 0 })));
    }));
    router.put(`/${path}/:id`, route(async (req, res) => {
      const { revision, data } = z.object({ revision: z.number().int().nonnegative(), data: schema }).strict().parse(req.body);
      const error = await checkLinks(kind, req.params.id, data);
      if (error) return res.status(400).json({ error });
      const updated = await Records.findOneAndUpdate({ _id: req.params.id, kind, revision }, { $set: { data }, $inc: { revision: 1 } }, { new: true }).lean();
      if (!updated) return res.status(409).json({ error: 'This entry changed elsewhere. Copy your draft, close it, and reload before trying again.' });
      res.json(record(updated));
    }));
  }
  router.put('/overview', route(async (req, res) => {
    const { revision, data } = z.object({ revision: z.number().int().nonnegative(), data: overviewSchema }).strict().parse(req.body);
    const updated = await Records.findOneAndUpdate({ _id: 'hustliq-overview', kind: 'overview', revision }, { $set: { data }, $inc: { revision: 1 } }, { new: true }).lean();
    if (!updated) return res.status(409).json({ error: 'The overview changed elsewhere. Copy your draft, close it, and reload before trying again.' });
    res.json(record(updated));
  }));
  return router;
}

export const journeyRouter = createJourneyRouter();
