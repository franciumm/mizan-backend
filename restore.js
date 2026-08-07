import fs from 'fs';
import { connectDb, disconnectDb } from './src/db/client.js';
import { Horizon, Goal, Task, DailyLog } from './src/db/schema.js';

async function restore() {
  await connectDb();
  
  const data = JSON.parse(fs.readFileSync('/Users/francium/Documents/Codex/2026-08-05/sites-plugin-sites-openai-bundled-create/sync_output.json', 'utf8'));

  console.log('Restoring Horizons...');
  for (const h of data.horizons || []) {
    await Horizon.findOneAndUpdate({ _id: h._id }, h, { upsert: true });
  }

  console.log('Restoring Goals...');
  for (const g of data.goals || []) {
    await Goal.findOneAndUpdate({ _id: g._id }, g, { upsert: true });
  }

  console.log('Restoring Tasks (Today)...');
  for (const t of data.tasks?.today || []) {
    t.goalIds = t.goalIds || [];
    await Task.findOneAndUpdate({ _id: t._id }, t, { upsert: true });
  }

  console.log('Restoring Tasks (Tomorrow)...');
  for (const t of data.tasks?.tomorrow || []) {
    t.goalIds = t.goalIds || [];
    await Task.findOneAndUpdate({ _id: t._id }, t, { upsert: true });
  }

  console.log('Restoring DailyLog...');
  if (data.dailyLog) {
    await DailyLog.findOneAndUpdate({ _id: data.dailyLog._id }, data.dailyLog, { upsert: true });
  }

  console.log('Restore complete!');
  await disconnectDb();
}

restore().catch(console.error);
