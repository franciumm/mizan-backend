import { connectDb, disconnectDb } from './src/db/client.js';
import { Horizon, Goal } from './src/db/schema.js';

async function dedupe() {
  await connectDb();
  
  const duplicatedHorizonIds = ['h-4-next-30-days', 'h-5-next-3-months', 'h-6-one-year', 'h-7-five-years'];

  console.log('Deleting duplicated goals...');
  const resultGoals = await Goal.deleteMany({ horizonId: { $in: duplicatedHorizonIds } });
  console.log(`Deleted ${resultGoals.deletedCount} goals.`);

  console.log('Deleting duplicated horizons...');
  const resultHorizons = await Horizon.deleteMany({ _id: { $in: duplicatedHorizonIds } });
  console.log(`Deleted ${resultHorizons.deletedCount} horizons.`);

  console.log('Deduplication complete!');
  await disconnectDb();
}

dedupe().catch(console.error);
