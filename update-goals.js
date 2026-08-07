import { connectDb, disconnectDb } from './src/db/client.js';
import { Horizon, Goal, Task } from './src/db/schema.js';

async function updateGoals() {
  await connectDb();
  console.log("Connected to DB");

  // Delete all existing goals
  await Goal.deleteMany({});
  console.log("Cleared old goals");

  // Get horizons
  const horizons = await Horizon.find();
  const getHorizonId = (label) => {
    const h = horizons.find(h => h.label === label);
    if (!h) throw new Error("Horizon not found: " + label);
    return h._id;
  };

  const goalsMap = {}; // title -> _id
  
  async function createGoal(title, horizonLabel, parentTitles = []) {
    const parentGoalIds = parentTitles.map(t => {
      if (!goalsMap[t]) throw new Error("Parent not found: " + t);
      return goalsMap[t];
    });
    const goal = await Goal.create({
      title,
      horizonId: getHorizonId(horizonLabel),
      parentGoalIds
    });
    goalsMap[title] = goal._id.toString();
    return goal;
  }

  // --- FIVE YEARS ---
  await createGoal("Earn $10k–$20k/month", "Five Years");
  await createGoal("Develop top-tier sales and networking skills", "Five Years");
  await createGoal("Build a strong, healthy 90kg body and finish a 5km race", "Five Years");
  await createGoal("Grow YouTube, learn seven languages and sharpen fighting skills", "Five Years");

  // --- ONE YEAR ---
  await createGoal("Reach $1,000/month", "One Year", ["Earn $10k–$20k/month"]);
  await createGoal("Become above average at sales, networking and public speaking", "One Year", ["Develop top-tier sales and networking skills"]);
  await createGoal("Pass exams with health and relationships intact", "One Year", ["Build a strong, healthy 90kg body and finish a 5km race"]);
  await createGoal("Do not miss prayer and grow closer to God", "One Year");

  // --- NEXT 3 MONTHS ---
  await createGoal("Earn the first $200/month", "Next 3 Months", ["Reach $1,000/month"]);
  await createGoal("Build a repeatable outreach rhythm", "Next 3 Months", ["Become above average at sales, networking and public speaking"]);
  await createGoal("Raise stamina and health above average", "Next 3 Months", ["Pass exams with health and relationships intact"]);

  // --- NEXT 30 DAYS ---
  await createGoal("HustleIQ Publish & first User", "Next 30 Days", ["Earn the first $200/month"]);
  await createGoal("Begin agency outreach", "Next 30 Days", ["Earn the first $200/month", "Build a repeatable outreach rhythm"]);
  await createGoal("Improve physical and mental health", "Next 30 Days", ["Raise stamina and health above average"]);

  console.log("Goals seeded accurately.");

  // Update tasks that might have been referencing the old beta testers goal
  const newGoalId = goalsMap["HustleIQ Publish & first User"];
  
  const tasksToUpdate = await Task.find({
    title: { $in: ["HustleIQ Outreaching", "HustleIQ App ready for testing"] }
  });

  for (const t of tasksToUpdate) {
    t.goalIds = [newGoalId];
    await t.save();
  }
  
  // Also, if any other tasks have orphaned goalIds, clear them
  const validGoalIds = Object.values(goalsMap);
  await Task.updateMany(
    { goalIds: { $nin: validGoalIds } },
    { $set: { goalIds: [] } }
  );

  console.log("Tasks synced with new goals.");

  await disconnectDb();
}

updateGoals().catch(console.error);
