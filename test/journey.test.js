import { beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createJourneyRouter } from '../src/routes/journey.js';
import { journeyStore } from './helpers/journey-store.js';
import { eventSchema } from '../src/journey/schema.js';

let app;
let store;
beforeEach(() => {
  store = journeyStore();
  // Synthetic history exercises links without publishing the founder's private notes.
  const ids = ['hustliq-origin', 'hustliq-solo', 'hustliq-pause', 'hustliq-distribution'];
  ids.forEach((id, i) => store.docs.set(id, { _id: id, kind: 'event', revision: 0, data: eventSchema.parse({ title: `Test event ${i + 1}`, parentIds: i ? [ids[i - 1]] : [] }) }));
  app = express(); app.use(express.json()); app.use('/api/journey', createJourneyRouter(store));
});
const initialize = () => request(app).post('/api/journey/initialize');
const get = () => request(app).get('/api/journey');
const payload = ({ _id, revision, ...data }, changes = {}) => ({ revision, data: { ...data, ...changes } });

describe('HustlIQ journey', () => {
  it('initializes an empty store without embedding private founder history', async () => {
    store.docs.clear();
    await initialize();
    const { body } = await get();
    expect(body.events).toHaveLength(0);
    expect(body.playbooks).toHaveLength(3);
    expect(body.playbooks.every(p => p.sourceEventIds.length === 0)).toBe(true);
    expect(body.overview.focus).toBe('');
  });
  it('preserves existing history without inventing dates, outcomes, or proven procedures', async () => {
    expect((await get()).body.initialized).toBe(false);
    expect((await initialize()).status).toBe(200);
    const { body } = await get();
    expect(body.events).toHaveLength(4); expect(body.playbooks).toHaveLength(3);
    expect(body.events.every(e => e.date === null && e.signal === 'Not assessed' && e.result === '')).toBe(true);
    expect(body.playbooks.every(p => p.status === 'Draft')).toBe(true);
    expect(body.overview.purpose).toBe('');
  });
  it('preserves edited and archived records when initialization is retried', async () => {
    await initialize();
    const event = (await get()).body.events[0];
    expect((await request(app).put(`/api/journey/events/${event._id}`).send(payload(event, { title: 'Corrected origin', status: 'Archived' }))).status).toBe(200);
    await initialize();
    const latest = (await get()).body;
    expect(latest.events).toHaveLength(4);
    expect(latest.events.find(e => e._id === event._id)).toMatchObject({ title: 'Corrected origin', status: 'Archived', revision: 1 });
  });
  it('saves an experiment, later results, links and nested updates across fetches', async () => {
    await initialize();
    const { body: event } = await request(app).post('/api/journey/events').send({ title: 'Test a message', type: 'Experiment', status: 'Ongoing', expectation: 'Three relevant replies', parentIds: ['hustliq-distribution'] });
    const update = { result: 'One relevant reply', signal: 'Mixed', evidence: 'A small sample', links: [{ label: 'Research', url: 'https://example.com/research' }], updates: [{ id: 'followup', text: 'A detailed follow-up. '.repeat(30).trim(), date: null }] };
    expect((await request(app).put(`/api/journey/events/${event._id}`).send(payload(event, update))).status).toBe(200);
    const saved = (await get()).body.events.find(e => e._id === event._id);
    expect(saved).toMatchObject({ ...update, expectation: 'Three relevant replies', revision: 1 });
  });
  it('rejects stale saves without overwriting newer work', async () => {
    const { body: event } = await request(app).post('/api/journey/events').send({ title: 'Original' });
    await request(app).put(`/api/journey/events/${event._id}`).send(payload(event, { title: 'Newer work' }));
    expect((await request(app).put(`/api/journey/events/${event._id}`).send(payload(event, { title: 'Stale work' }))).status).toBe(409);
    expect((await get()).body.events.find(e => e._id === event._id).title).toBe('Newer work');
  });
  it('rejects missing references, self references, and causal cycles', async () => {
    await initialize();
    const origin = (await get()).body.events.find(e => e._id === 'hustliq-origin');
    for (const parentIds of [['missing'], ['hustliq-origin'], ['hustliq-distribution']]) {
      expect((await request(app).put(`/api/journey/events/${origin._id}`).send(payload(origin, { parentIds }))).status).toBe(400);
    }
    expect((await request(app).post('/api/journey/playbooks').send({ title: 'Method', sourceEventIds: ['missing'] })).status).toBe(400);
  });
  it('validates dates, evidence URLs, duplicate references and unexpected fields', async () => {
    for (const data of [{ date: '2026-02-30' }, { links: [{ label: 'Unsafe', url: 'javascript:alert(1)' }] }, { parentIds: ['a', 'a'] }, { inventedScore: 90 }]) {
      expect((await request(app).post('/api/journey/events').send({ title: 'Valid title', ...data })).status).toBe(400);
    }
    expect((await request(app).post('/api/journey/events').send({ title: ' ' })).status).toBe(400);
  });
  it('persists detailed playbooks and overview with revision checks', async () => {
    await initialize(); const { playbooks, overview } = (await get()).body; const p = playbooks[0];
    expect((await request(app).put(`/api/journey/playbooks/${p._id}`).send(payload(p, { steps: 'An adapted procedure', status: 'In use' }))).status).toBe(200);
    expect((await request(app).put(`/api/journey/playbooks/${p._id}`).send(payload(p))).status).toBe(409);
    expect((await request(app).put('/api/journey/overview').send(payload(overview, { purpose: 'My actual reason' }))).status).toBe(200);
    expect((await request(app).put('/api/journey/overview').send(payload(overview))).status).toBe(409);
    const latest = (await get()).body;
    expect(latest.overview.purpose).toBe('My actual reason');
    expect(latest.playbooks.find(b => b._id === p._id)).toMatchObject({ steps: 'An adapted procedure', status: 'In use', sourceEventIds: p.sourceEventIds });
  });
  it('never overwrites another record kind through an event endpoint', async () => {
    await initialize();
    expect((await request(app).put('/api/journey/events/research-business').send({ revision: 0, data: { title: 'Wrong kind' } })).status).toBe(409);
    expect((await get()).body.playbooks[0].title).toBe('Research a business before choosing a distribution test');
  });
});
