// An isolated store for router tests and local browser checks. No database access.
export function journeyStore() {
  const docs = new Map();
  const matches = (doc, query) => Object.entries(query).every(([key, value]) => doc[key] === value);
  return {
    docs,
    find: (query = {}) => ({ lean: async () => structuredClone([...docs.values()].filter(doc => matches(doc, query))) }),
    bulkWrite: async operations => {
      for (const { updateOne: { filter, update } } of operations) {
        if (!docs.has(filter._id)) docs.set(filter._id, structuredClone(update.$setOnInsert));
      }
    },
    create: async doc => { docs.set(doc._id, structuredClone(doc)); return structuredClone(doc); },
    findOneAndUpdate: (query, update) => ({ lean: async () => {
      const doc = docs.get(query._id);
      if (!doc || !matches(doc, query)) return null;
      const updated = { ...doc, data: structuredClone(update.$set.data), revision: doc.revision + update.$inc.revision };
      docs.set(doc._id, updated); return structuredClone(updated);
    } }),
  };
}
