import { connectDb, disconnectDb } from '../db/client.js';
import { Horizon, Goal, Task, DailyLog, PastTask, Draft, AiResponse } from '../db/schema.js';

const MODELS = [AiResponse, Draft, PastTask, DailyLog, Task, Goal, Horizon];

export async function resetDb() {
  for (const M of MODELS) {
    await M.deleteMany({});
  }
}

// Ensure a single clean connection per test run.
export async function ensureTestDb() {
  await connectDb();
  await resetDb();
}

export { disconnectDb };
