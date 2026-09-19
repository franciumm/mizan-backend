export function lifeOSStore() {
  let doc = null;
  const matches = (value, query) => value && Object.entries(query).every(([key, expected]) => value[key] === expected);
  return {
    get doc() { return doc; },
    findById: id => ({ lean: async () => doc?._id === id ? structuredClone(doc) : null }),
    create: async value => {
      if (doc) { const error = new Error('duplicate'); error.code = 11000; throw error; }
      doc = structuredClone(value);
      return structuredClone(doc);
    },
    findOneAndUpdate: (query, update) => ({ lean: async () => {
      if (!matches(doc, query)) return null;
      doc = { ...doc, store: structuredClone(update.$set.store), revision: doc.revision + update.$inc.revision };
      return structuredClone(doc);
    } }),
  };
}
