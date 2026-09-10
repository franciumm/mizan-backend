import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { assetSchema, settingsSchema } from '../src/content/schema.js';

// Exercise the actual router and validation without touching the user's database.
const db = vi.hoisted(() => {
  const assets = new Map(); const settings = new Map();
  function model(store) {
    return {
      find: () => ({ sort: () => ({ lean: async () => [...store.values()] }) }),
      findById: id => ({ lean: async () => store.get(id) || null }),
      bulkWrite: async ops => { for (const { updateOne: { filter, update } } of ops) if (!store.has(filter._id)) store.set(filter._id, { _id: filter._id, ...structuredClone(update.$setOnInsert) }); },
      updateOne: async (filter, update) => { if (!store.has(filter._id)) store.set(filter._id, { _id: filter._id, ...structuredClone(update.$setOnInsert) }); },
      create: async doc => { store.set(doc._id, structuredClone(doc)); return doc; },
      findOneAndUpdate: (filter, update) => ({ lean: async () => { const existing = store.get(filter._id); if (!existing || existing.revision !== filter.revision) return null; const doc = { ...existing, data: structuredClone(update.$set.data), revision: existing.revision + 1 }; store.set(doc._id, doc); return doc; } }),
    };
  }
  return { assets, settings, assetModel: model(assets), settingsModel: model(settings) };
});
vi.mock('../src/content/models.js', () => ({ ContentAsset: db.assetModel, ContentSettings: db.settingsModel }));
import { contentRouter } from '../src/routes/content.js';
const app = express(); app.use(express.json()); app.use('/api/content', contentRouter);
beforeEach(() => { db.assets.clear(); db.settings.clear(); });
const create = () => request(app).post('/api/content/assets').send({ identity: 'enzo', title: 'A real work story' });

describe('content workspace', () => {
  it('imports exactly 70 personal and 80 company candidates with unknown performance', async () => {
    expect((await request(app).post('/api/content/initialize')).status).toBe(200);
    const { body } = await request(app).get('/api/content');
    expect(body.assets.filter(a => a.identity === 'enzo')).toHaveLength(70);
    expect(body.assets.filter(a => a.identity === 'hustliq')).toHaveLength(80);
    expect(body.assets.every(a => a.status === 'IDEA' && a.filmingDate === null && a.publications.every(p => p.status === 'DRAFT' && p.metrics.views === null))).toBe(true);
    expect(body.settings.startDate).toBeNull();
  });
  it('repeat initialization preserves edited ideas and configuration', async () => {
    await request(app).post('/api/content/initialize');
    const { body } = await request(app).get('/api/content');
    const { _id, revision, ...data } = body.assets[0];
    await request(app).put(`/api/content/assets/${_id}`).send({ revision, data: { ...data, title: 'My edited title', status: 'RESEARCHING' } });
    await request(app).post('/api/content/initialize');
    const latest = await request(app).get('/api/content');
    expect(latest.body.assets).toHaveLength(150);
    expect(latest.body.assets.find(a => a._id === _id).title).toBe('My edited title');
  });
  it('updates an asset and refuses stale writes', async () => {
    const { body: { _id, revision, ...data } } = await create();
    const first = await request(app).put(`/api/content/assets/${_id}`).send({ revision, data: { ...data, status: 'FILMED' } });
    expect(first.status).toBe(200); expect(first.body.revision).toBe(1);
    expect((await request(app).put(`/api/content/assets/${_id}`).send({ revision, data })).status).toBe(409);
  });
  it('allows one published platform while the other two remain drafts', async () => {
    const data = assetSchema.parse({ identity: 'hustliq', title: 'Research method' });
    data.status = 'PUBLISHED'; data.publications[0].status = 'PUBLISHED'; data.publications[0].date = '2026-09-14'; data.publications[0].metrics.views = 0;
    const r = await request(app).post('/api/content/assets').send(data);
    expect(r.status).toBe(201); expect(r.body.publications[1].status).toBe('DRAFT'); expect(r.body.publications[0].metrics.views).toBe(0); expect(r.body.publications[1].metrics.views).toBeNull();
  });
  it('rejects dates, duplicate platforms, unsafe URLs, and negative metrics', async () => {
    for (const patch of [a => { a.filmingDate = '2026-02-30'; }, a => { a.publications[1].platform = 'TikTok'; }, a => { a.publications[0].url = 'javascript:alert(1)'; }, a => { a.publications[0].metrics.views = -1; }]) {
      const data = assetSchema.parse({ identity: 'enzo', title: 'Valid title' }); patch(data);
      expect((await request(app).post('/api/content/assets').send(data)).status).toBe(400);
    }
  });
  it('requires actual publication records and prevents private scheduling', async () => {
    expect((await request(app).post('/api/content/assets').send({ identity: 'enzo', title: 'Test', status: 'PUBLISHED' })).status).toBe(400);
    expect((await request(app).post('/api/content/assets').send({ identity: 'enzo', title: 'Test', status: 'SCHEDULED', scheduledDate: '2026-09-14', privacy: 'Private — do not publish' })).status).toBe(400);
  });
  it('persists settings with revision checks and permits clearing the start', async () => {
    await request(app).post('/api/content/initialize');
    const data = settingsSchema.parse({ startDate: '2026-09-14' });
    const r = await request(app).put('/api/content/settings').send({ revision: 0, data });
    expect(r.status).toBe(200); expect(r.body.startDate).toBe('2026-09-14');
    const cleared = await request(app).put('/api/content/settings').send({ revision: 1, data: { ...data, startDate: null } });
    expect(cleared.body.startDate).toBeNull();
  });
});
