import { Horizon, Goal, Task, DailyLog, PastTask, AiResponse } from '../db/schema.js';
import mongoose from 'mongoose';
import crypto from 'node:crypto';

export async function migratePayload({ lifeOsV2, lifeOsV1, goalsV2, goalsV1, insights }) {
  const summary = { tasks: 0, goals: 0, horizons: 0, pastDays: 0, insights: 0 };
  const goalIdMap = new Map(); // oldId → preservedId (here the same value — UUIDs pass through)

  // GOALS first (tasks reference them). Upsert by _id so re-runs are no-ops.
  const goalSources = [
    ...(goalsV2 ?? []).map((h) => ({ ...h, _version: 2 })),
    ...(goalsV1 ?? []).map((h) => ({ ...h, _version: 1 })),
  ];

  const horizonOps = [];
  const goalOps = [];
  const horizonLabels = new Set();

  for (let i = 0; i < goalSources.length; i++) {
    const h = goalSources[i];
    // Stable _id for horizons: derived from label so re-runs don't create dupes
    // (v1 labels may collide across users, but single-user here — label is fine).
    const horizonId = `h-${i}-${h.label.replace(/\s+/g, '-').toLowerCase()}`;
    horizonOps.push({
      updateOne: {
        filter: { _id: horizonId },
        update: { $setOnInsert: {
          _id: horizonId, label: h.label,
          startDate: h.startDate ?? null, targetDate: h.targetDate ?? null, position: i,
        } },
        upsert: true,
      },
    });
    horizonLabels.add(horizonId);

    for (let j = 0; j < (h.goals ?? []).length; j++) {
      const g = h.goals[j];
      const isStr = typeof g === 'string';
      const oldId = isStr ? null : g.id;
      const title = isStr ? g : g.title;
      const tasksDone = isStr ? 0 : (g.tasksDone ?? 0);
      const newId = oldId && oldId.length === 36 ? oldId : crypto.randomUUID();
      if (oldId) goalIdMap.set(oldId, newId);

      goalOps.push({
        updateOne: {
          filter: { _id: newId },
          update: { $setOnInsert: {
            _id: newId, horizonId, title, tasksDone, position: j,
            parentGoalIds: isStr ? [] : (g.parentGoalIds ?? (g.parentGoalId ? [g.parentGoalId] : [])),
          } },
          upsert: true,
        },
      });
    }
  }

  if (horizonOps.length) {
    const r = await Horizon.bulkWrite(horizonOps, { ordered: false });
    summary.horizons = r.upsertedCount;
  }
  if (goalOps.length) {
    const r = await Goal.bulkWrite(goalOps, { ordered: false });
    summary.goals = r.upsertedCount;
  }

  // Now that goals exist, stamp any parentGoalIds that referenced unmapped v1 ids.
  for (const h of goalsV2 ?? []) {
    for (const g of (h.goals ?? [])) {
      if (typeof g === 'object' && g.parentGoalIds?.length) {
        const mapped = g.parentGoalIds.map((id) => goalIdMap.get(id) ?? id);
        await Goal.updateOne({ _id: g.id }, { $set: { parentGoalIds: mapped } });
      }
    }
  }

  // DAILY LOG + TASKS (and embedded prayers)
  const lifeOs = lifeOsV2 ?? lifeOsV1;
  if (lifeOs?.dateKey) {
    const dateKey = lifeOs.dateKey;
    await DailyLog.findByIdAndUpdate(
      dateKey,
      { $set: {
        mode: lifeOs.mode ?? 'grinding',
        challenge: lifeOs.challenge ?? '',
        challengeDone: !!lifeOs.challengeDone,
        quranDone: !!lifeOs.quranDone,
        highestTierDone: lifeOs.highestTierDone ?? 0,
        energy: lifeOs.checkIn?.energy ?? 3,
        pain: lifeOs.checkIn?.pain ?? 2,
        focus: lifeOs.checkIn?.focus ?? 3,
        contextNotes: lifeOs.contextNotes ?? [],
        prayers: (lifeOs.prayers ?? []).map((p, i) => ({
          _id: new mongoose.Types.ObjectId(), name: p.name, time: p.time ?? '', done: !!p.done, position: i,
        })),
      }, $setOnInsert: { _id: dateKey } },
      { upsert: true },
    );

    const taskOps = [];
    for (let i = 0; i < (lifeOs.tasks ?? []).length; i++) {
      const t = lifeOs.tasks[i];
      const linkedGoalIds = t.linkedGoalIds ?? (t.linkedGoalId ? [t.linkedGoalId] : []);
      const mapped = linkedGoalIds.map((id) => goalIdMap.get(id) ?? id);
      const newId = t.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(t.id))
        ? String(t.id) : crypto.randomUUID();
      taskOps.push({
        updateOne: {
          filter: { _id: newId },
          update: { $setOnInsert: {
            _id: newId, dateKey, title: t.title, category: t.category,
            range: t.range ?? '', minutes: t.minutes ?? 0, done: !!t.done,
            rolled: t.rolled ?? 0, kind: t.kind ?? 'support',
            details: t.details ?? null, position: i, goalIds: mapped,
          } },
          upsert: true,
        },
      });
    }
    if (taskOps.length) {
      const r = await Task.bulkWrite(taskOps, { ordered: false });
      summary.tasks = r.upsertedCount;
    }

    // Past tasks archive (one PastTask doc per entry)
    for (const past of lifeOs.pastTasks ?? []) {
      await PastTask.create({ dateKey: past.dateKey, taskJson: past.tasks ?? [] });
      summary.pastDays++;
    }
  }

  // Insights cache → ai_responses audit log
  for (const [key, value] of Object.entries(insights ?? {})) {
    const m = key.match(/^mizan-insights-(\d{4}-\d{2}-\d{2})$/);
    if (!m) continue;
    await AiResponse.create({
      endpoint: 'insights', dateKey: m[1],
      requestJson: { cached: true }, responseJson: value, fallback: !!value.fallback,
    }).catch(() => {}); // ignore duplicate-key races on re-run
    summary.insights++;
  }

  return summary;
}
