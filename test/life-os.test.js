import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createLifeOSRouter } from '../src/routes/life-os.js';
import { dailyEntrySchema } from '../src/life-os/schema.js';
import { lifeOSStore } from './helpers/life-os-store.js';

const emotions = { anxiety: 4, numbness: 2, motivation: 7, focus: 8, confidence: 6, loneliness: 3, mood: 7 };
const balance = { hustliq: 5, college: 2, mental: 3, physical: 3, content: 2, relationships: 2, learning: 3, recreation: 2 };
const workspaceKey = '2mOc8MzgPj22_lGFgkSDeYj0X_mqYngad5RUknNwseA';
const day = changes => dailyEntrySchema.parse({ emotions, balance, ...changes });

let app;
let records;
beforeEach(() => {
  records = lifeOSStore();
  app = express();
  app.use(express.json());
  app.use('/api/life-os', createLifeOSRouter(records));
});

const get = (through = '2026-09-19') => request(app).get(`/api/life-os?through=${through}`).set('x-mizan-workspace-key', workspaceKey);
const save = (revision, store, through = '2026-09-19') => request(app).put('/api/life-os').set('x-mizan-workspace-key', workspaceKey).send({ revision, store, through });

describe('Life OS backend', () => {
  it('starts empty and persists the complete system as the source of truth', async () => {
    const empty = await get();
    expect(empty.status).toBe(200);
    expect(empty.body).toMatchObject({ initialized: false, revision: 0, store: { version: 1, days: {}, episodes: [] } });

    const store = { version: 1, days: { '2026-09-19': day({ mustWin: 'Ship backend sync', done: { must: true }, focusOutcome: 'yes' }) }, episodes: [] };
    const result = await save(0, store);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ initialized: true, revision: 1, store });
    expect((await get()).body.store.days['2026-09-19'].mustWin).toBe('Ship backend sync');
  });

  it('calculates daily and seven-day progress on the server from concrete activity', async () => {
    const store = {
      version: 1,
      days: {
        '2026-09-19': day({
          mustWin: 'Finish sync', supports: ['Test API', 'Review UI'], done: { must: true, 'support-0': true },
          morning: { water: true, daylight: true }, focusMinutes: 90, focusOutcome: 'yes', codeMinutes: 30,
          filesUnderstood: 2, japaneseMinutes: 20, meaningfulConversation: true, rehab: 'yes', scrollMinutes: 25,
          reviewWorked: 'Started with the result.',
        }),
        '2026-09-18': day({ focusMinutes: 45, focusOutcome: 'partial', codeMinutes: 20, japaneseMinutes: 30, gym: 'yes', scrollMinutes: 45 }),
      },
      episodes: [
        { id: '82d3f4c4-72c8-47c1-a1f4-39b1a43903e1', dateKey: '2026-09-19', time: '14:20', location: 'Home', before: '', trigger: '', emotion: 'bored', intensity: 6, interrupted: true, replacement: 'Water', note: '' },
      ],
    };
    const { body } = await save(0, store);
    expect(body.progress.today).toMatchObject({ logged: true, priorities: { completed: 2, planned: 3, percent: 67 }, morning: { completed: 2, total: 6, percent: 33 } });
    expect(body.progress.week).toMatchObject({ daysLogged: 2, reviewedDays: 1, focusMinutes: 135, codeMinutes: 50, japaneseMinutes: 50, meaningfulConversations: 1, rehabSessions: 1, gymSessions: 1, averageConsumerScrollMinutes: 35, impulsesLogged: 1, impulsesInterrupted: 1 });
    expect(body.progress.week.targets.codeMinutes).toEqual({ achieved: 50, target: 140, percent: 36 });
  });

  it('rejects stale writes without overwriting the newer system state', async () => {
    const original = { version: 1, days: { '2026-09-19': day({ mustWin: 'Original' }) }, episodes: [] };
    expect((await save(0, original)).status).toBe(200);
    const newer = { ...original, days: { '2026-09-19': day({ mustWin: 'Newer' }) } };
    expect((await save(1, newer)).status).toBe(200);
    const stale = { ...original, days: { '2026-09-19': day({ mustWin: 'Stale' }) } };
    expect((await save(1, stale)).status).toBe(409);
    expect((await get()).body.store.days['2026-09-19'].mustWin).toBe('Newer');
  });

  it('validates dates, field limits, enums, and unexpected data', async () => {
    expect((await get('2026-02-30')).status).toBe(400);
    expect((await save(0, { version: 1, days: { nope: day({}) }, episodes: [] })).status).toBe(400);
    expect((await save(0, { version: 1, days: { '2026-09-19': { ...day({}), inventedScore: 99 } }, episodes: [] })).status).toBe(400);
    expect((await save(0, { version: 1, days: { '2026-09-19': { ...day({}), focusMinutes: 500 } }, episodes: [] })).status).toBe(400);
  });

  it('requires a strong workspace key and isolates records by its hash', async () => {
    expect((await request(app).get('/api/life-os')).status).toBe(401);
    expect((await request(app).get('/api/life-os').set('x-mizan-workspace-key', 'short')).status).toBe(400);
    const otherKey = 'B1Jlcxz2pCVTwPM4qW9eETZAu_3q0KdBzT46zhSKgxM';
    const other = await request(app).get('/api/life-os?through=2026-09-19').set('x-mizan-workspace-key', otherKey);
    expect(other.body).toMatchObject({ initialized: false, revision: 0 });
  });

  it('restores schema defaults when Mongo minimizes empty nested maps', async () => {
    const store = { version: 1, days: { '2026-09-19': day({}) }, episodes: [] };
    expect((await save(0, store)).status).toBe(200);
    delete records.doc.store.days['2026-09-19'].morning;
    delete records.doc.store.days['2026-09-19'].done;
    const result = await get();
    expect(result.status).toBe(200);
    expect(result.body.store.days['2026-09-19']).toMatchObject({ morning: {}, done: {} });
    expect(result.body.progress.today.morning).toEqual({ completed: 0, total: 6, percent: 0 });
  });
});
