import { runRolloverIfNeeded } from './rollover.js';
import { cairoDateAddDays } from '../lib/cairo.js';
import { horizonRepo } from '../repositories/horizon.js';
import { goalRepo } from '../repositories/goal.js';
import { taskRepo } from '../repositories/task.js';
import { dailyLogRepo } from '../repositories/daily-log.js';
import { pastTaskRepo } from '../repositories/past-task.js';
import { draftRepo } from '../repositories/draft.js';
import { CourageRep } from '../db/schema.js';

export async function buildSyncPayload() {
  const { today } = await runRolloverIfNeeded();
  const tomorrow = cairoDateAddDays(new Date(), 1);

  const [horizons, goals, todayTasks, tomorrowTasks, dailyLog, pastTasks, drafts, reps] = await Promise.all([
    horizonRepo.findAll(),
    goalRepo.findAll(),
    taskRepo.findByDate(today),
    taskRepo.findByDate(tomorrow),
    dailyLogRepo.findByDate(today),
    pastTaskRepo.listSince(today, 30),
    draftRepo.getAll(),
    CourageRep.find().sort({ createdAt: 1 }).lean(),
  ]);

  // Derive goalParents from each goal's parentGoalIds array (frontend shape compat).
  const goalParents = goals.flatMap((g) =>
    (g.parentGoalIds ?? []).map((pid) => ({ goalId: g._id, parentGoalId: pid })),
  );

  return {
    dateKey: today,
    horizons,
    goals,
    goalParents,
    tasks: { today: todayTasks, tomorrow: tomorrowTasks },
    dailyLog,
    prayers: dailyLog?.prayers ?? [],   // embedded on the daily log
    pastTasks,
    drafts,
    reps,
  };
}
