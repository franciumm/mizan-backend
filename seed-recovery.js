import { connectDb, disconnectDb } from './src/db/client.js';
import { Horizon, Goal, Task, DailyLog } from './src/db/schema.js';
import { cairoToday } from './src/lib/cairo.js';

async function seed() {
  await connectDb();
  console.log("Connected to DB");

  // Delete everything
  await Task.deleteMany({});
  await Goal.deleteMany({});
  await Horizon.deleteMany({});
  console.log("Cleared old data");

  // Create Horizons
  const horizonsData = [
    { label: "Lifetime", position: 0 },
    { label: "Five Years", position: 1 },
    { label: "One Year", position: 2 },
    { label: "Next 3 Months", position: 3 },
    { label: "Next 30 Days", position: 4 }
  ];
  const createdHorizons = await Horizon.insertMany(horizonsData);
  const getHorizonId = (label) => createdHorizons.find(h => h.label === label)._id;

  // Insert Goals
  const goalsMap = {}; // title -> _id
  
  // Helper to create goal
  async function createGoal(title, horizonLabel, parentTitles = []) {
    const parentGoalIds = parentTitles.map(t => goalsMap[t]).filter(Boolean);
    const goal = await Goal.create({
      title,
      horizonId: getHorizonId(horizonLabel),
      parentGoalIds
    });
    goalsMap[title] = goal._id.toString();
    return goal;
  }

  // Create top-level or independent goals first
  await createGoal("Develop top-tier sales and networking skills", "Five Years");
  await createGoal("Build a strong, healthy 90kg body and finish a 5km race", "Five Years");
  await createGoal("Grow YouTube, learn seven languages and sharpen fighting skills", "Five Years");
  await createGoal("Do not miss prayer and grow closer to God", "One Year");
  await createGoal("Improve physical and mental health", "Next 30 Days");
  await createGoal("Finish Mizan and make it dynamic", "Next 3 Months");

  // Create layer 2
  await createGoal("Become above average at sales, networking and public speaking", "One Year", ["Develop top-tier sales and networking skills"]);
  await createGoal("Pass exams with health and relationships intact", "One Year", ["Build a strong, healthy 90kg body and finish a 5km race"]);
  
  // Create layer 3
  await createGoal("Build a repeatable outreach rhythm", "Next 3 Months", ["Become above average at sales, networking and public speaking"]);
  await createGoal("Raise stamina and health above average", "Next 3 Months", ["Pass exams with health and relationships intact"]);

  // Create layer 4
  await createGoal("Recruit real beta testers and validate the core idea", "Next 30 Days", ["Finish Mizan and make it dynamic"]);
  await createGoal("Begin agency outreach", "Next 30 Days", ["Build a repeatable outreach rhythm", "Finish Mizan and make it dynamic"]);

  console.log("Goals seeded");

  // Create Tasks
  const today = cairoToday();
  const tasksData = [
    {
      dateKey: today,
      title: "Finish Mizan and make it dynamic",
      category: "Business",
      kind: "mission",
      range: "1:00 - 5:00",
      minutes: 180,
      goalIds: [],
      position: 0,
      done: false, rolled: 0
    },
    {
      dateKey: today,
      title: "Meditate 2 for minutes",
      category: "Mind",
      kind: "support",
      range: "Flexible",
      minutes: 2,
      goalIds: [],
      position: 1,
      done: false, rolled: 0
    },
    {
      dateKey: today,
      title: "Learn a random thing from one of these videos",
      category: "Personality",
      kind: "support",
      range: "at least 1 hour",
      minutes: 60,
      goalIds: [],
      position: 2,
      done: false, rolled: 0
    },
    {
      dateKey: today,
      title: "Make your Plan for tomorrow ready",
      category: "Business",
      kind: "mission",
      range: "Before sleep",
      minutes: 25,
      goalIds: [],
      position: 3,
      done: false, rolled: 0
    },
    {
      dateKey: today,
      title: "Stretch your leg",
      category: "Health",
      kind: "mission",
      range: "Before and after sleep",
      minutes: 35,
      goalIds: [],
      position: 4,
      done: false, rolled: 0
    },
    {
      dateKey: today,
      title: "HustleIQ Outreaching",
      category: "Business",
      kind: "mission",
      range: "Flexible",
      minutes: 60,
      goalIds: [goalsMap["Recruit real beta testers and validate the core idea"]],
      position: 5,
      done: false, rolled: 0
    },
    {
      dateKey: today,
      title: "HustleIQ App ready for testing",
      category: "Business",
      kind: "mission",
      range: "Flexible",
      minutes: 240,
      details: "Optimize the UI/UX for the App. Improve the onboarding questions for getting better context and make him answer better",
      goalIds: [goalsMap["Recruit real beta testers and validate the core idea"]],
      position: 6,
      done: false, rolled: 0
    },
    {
      dateKey: today,
      title: "Have 2 normal long conversation with a family member",
      category: "Family",
      kind: "mission",
      range: "Flexible",
      minutes: 120,
      goalIds: [],
      position: 7,
      done: false, rolled: 0
    },
    {
      dateKey: today,
      title: "Learn Drizzle/TSX",
      category: "Business",
      kind: "support",
      range: "Flexible",
      minutes: 60,
      details: "Either watch the Drizzle Video or TSX and try to code your own",
      goalIds: [],
      position: 8,
      done: false, rolled: 0
    }
  ];

  await Task.insertMany(tasksData);
  console.log("Tasks seeded");

  await disconnectDb();
}

seed().catch(console.error);
