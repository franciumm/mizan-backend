import { Goal, Task } from '../db/schema.js';

export async function recomputeAllGoalCounts(session) {
  // 1. Reset all tasksDone to 0
  await Goal.updateMany({}, { $set: { tasksDone: 0 } }, { session });

  // 2. Fetch graph topology
  const allGoals = await Goal.find().session(session).lean();
  const goalMap = new Map(allGoals.map(g => [g._id, g]));

  // 3. Fetch all completed tasks
  const doneTasks = await Task.find({ done: true }).select('goalIds').session(session).lean();

  // 4. Compute DAG mathematically in memory
  const counts = new Map();
  for (const t of doneTasks) {
    if (!t.goalIds?.length) continue;
    
    const visited = new Set();
    const queue = [...t.goalIds];
    
    while (queue.length) {
      const id = String(queue.shift());
      if (visited.has(id)) continue;
      visited.add(id);
      
      counts.set(id, (counts.get(id) || 0) + 1);
      
      const g = goalMap.get(id);
      for (const pid of g?.parentGoalIds ?? []) {
        queue.push(pid);
      }
    }
  }

  // 5. Bulk write exact counts back
  const bulkOps = [];
  for (const [id, count] of counts.entries()) {
    bulkOps.push({
      updateOne: {
        filter: { _id: id },
        update: { $set: { tasksDone: count } }
      }
    });
  }
  
  if (bulkOps.length) {
    await Goal.bulkWrite(bulkOps, { session });
  }
}
