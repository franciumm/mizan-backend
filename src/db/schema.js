import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const CATEGORY = ['Business', 'Health', 'Faith', 'College', 'Mind', 'Personality', 'Family', 'Life', 'Ops'];
const DAY_MODE = ['grinding', 'recovery', 'vacation'];
const TASK_KIND = ['mission', 'support'];

// _id is a UUID v4 string (default randomUUID) — preserves migration compat with localStorage UUIDs.
const uuidSchemaOpts = { type: String, default: () => crypto.randomUUID() };

const horizonSchema = new Schema({
  _id: uuidSchemaOpts,
  label: { type: String, required: true },
  startDate: { type: String, default: null },   // 'YYYY-MM-DD' or null
  targetDate: { type: String, default: null },
  position: { type: Number, default: 0 },
}, { _id: false, versionKey: false });
horizonSchema.index({ position: 1 });

const goalSchema = new Schema({
  _id: uuidSchemaOpts,
  horizonId: { type: String, required: true, ref: 'Horizon' },
  title: { type: String, required: true },
  tasksDone: { type: Number, default: 0 },
  position: { type: Number, default: 0 },
  parentGoalIds: { type: [String], default: [] },   // replaces goal_parents join table
}, { _id: false, versionKey: false });
goalSchema.index({ horizonId: 1, position: 1 });

// Goal delete hook: clean up dangling parentGoalIds and task.goalIds.
// Registered before model compilation per Mongoose best practices.
goalSchema.pre('findOneAndDelete', { document: false, query: true }, async function () {
  const doc = await this.model.findOne(this.getFilter());
  if (!doc) return;
  const id = doc._id;
  await Goal.updateMany({ parentGoalIds: id }, { $pull: { parentGoalIds: id } });
  await Task.updateMany({ goalIds: id }, { $pull: { goalIds: id } });
});

const taskSchema = new Schema({
  _id: uuidSchemaOpts,
  dateKey: { type: String, required: true },          // 'YYYY-MM-DD'
  title: { type: String, required: true },
  category: { type: String, required: true, enum: CATEGORY },
  range: { type: String, default: '' },
  minutes: { type: Number, default: 0 },
  done: { type: Boolean, default: false },
  rolled: { type: Number, default: 0 },
  kind: { type: String, default: 'support', enum: TASK_KIND },
  details: { type: String, default: null },
  position: { type: Number, default: 0 },
  goalIds: { type: [String], default: [] },           // replaces task_goals join table
}, { _id: false, versionKey: false });
taskSchema.index({ dateKey: 1 });
taskSchema.index({ goalIds: 1 });

// daily_logs._id IS the dateKey string — one document per day.
const prayerSchema = new Schema({
  name: { type: String, required: true },
  time: { type: String, default: '' },
  done: { type: Boolean, default: false },
  position: { type: Number, default: 0 },
}, { _id: true, versionKey: false });   // embedded subdoc → default ObjectId

const dailyLogSchema = new Schema({
  _id: { type: String, required: true },   // dateKey 'YYYY-MM-DD'
  mode: { type: String, default: 'grinding', enum: DAY_MODE },
  challenge: { type: String, default: '' },
  challengeDone: { type: Boolean, default: false },
  quranDone: { type: Boolean, default: false },
  highestTierDone: { type: Number, default: 0 },
  energy: { type: Number, default: 3 },
  pain: { type: Number, default: 2 },
  focus: { type: Number, default: 3 },
  contextNotes: { type: [String], default: [] },
  prayers: { type: [prayerSchema], default: [] },   // embedded — one day = one doc
}, { _id: false, versionKey: false });

// past_tasks auto-trimmed by MongoDB TTL index (30 days on createdAt).
const pastTaskSchema = new Schema({
  dateKey: { type: String, required: true },
  taskJson: { type: Schema.Types.Mixed, required: true },
  createdAt: { type: Date, default: Date.now },
}, { versionKey: false });
pastTaskSchema.index({ dateKey: -1, createdAt: -1 });
pastTaskSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

// drafts._id is the string key ('planner' | 'coach').
const draftSchema = new Schema({
  _id: { type: String, required: true },
  value: { type: String, default: '' },
}, { versionKey: false });

const aiResponseSchema = new Schema({
  endpoint: { type: String, required: true },
  dateKey: { type: String, default: null },
  requestJson: { type: Schema.Types.Mixed, required: true },
  responseJson: { type: Schema.Types.Mixed, required: true },
  fallback: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
}, { versionKey: false });
aiResponseSchema.index({ createdAt: -1 });

export const Horizon = model('Horizon', horizonSchema);
export const Goal = model('Goal', goalSchema);
export const Task = model('Task', taskSchema);
export const DailyLog = model('DailyLog', dailyLogSchema);
export const PastTask = model('PastTask', pastTaskSchema);
export const Draft = model('Draft', draftSchema);
export const AiResponse = model('AiResponse', aiResponseSchema);
