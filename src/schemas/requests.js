import { z } from 'zod';

const category = z.enum(['Business', 'Health', 'Faith', 'College', 'Mind', 'Personality', 'Family', 'Life', 'Ops']);

export const createTaskSchema = z.object({
  dateKey: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().min(1).max(200),
  category,
  range: z.string().max(80).default(''),
  minutes: z.number().int().min(0).default(0),
  done: z.boolean().default(false),
  rolled: z.number().int().min(0).max(4).default(0),
  kind: z.enum(['mission', 'support']).default('support'),
  details: z.string().optional(),
  position: z.number().int().default(0),
  linkedGoalIds: z.array(z.string().uuid()).optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  category: category.optional(),
  range: z.string().max(80).optional(),
  minutes: z.number().int().min(0).optional(),
  done: z.boolean().optional(),
  rolled: z.number().int().min(0).max(4).optional(),
  kind: z.enum(['mission', 'support']).optional(),
  details: z.string().nullable().optional(),
  position: z.number().int().optional(),
  linkedGoalIds: z.array(z.string().uuid()).optional(),
});

export const updateGoalSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  tasksDone: z.number().int().min(0).optional(),
  parentGoalIds: z.array(z.string().uuid()).optional(),
  position: z.number().int().optional(),
});

export const updateHorizonSchema = z.object({
  label: z.string().min(1).max(60).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  position: z.number().int().optional(),
});

export const patchDailyLogSchema = z.object({
  mode: z.enum(['grinding', 'recovery', 'vacation']).optional(),
  challenge: z.string().max(200).optional(),
  challengeDone: z.boolean().optional(),
  quranDone: z.boolean().optional(),
  highestTierDone: z.number().int().min(0).optional(),
  energy: z.number().int().min(1).max(5).optional(),
  pain: z.number().int().min(1).max(5).optional(),
  focus: z.number().int().min(1).max(5).optional(),
  score: z.number().int().min(0).max(100).optional(),
  contextNotes: z.array(z.string()).optional(),
  prayers: z.array(z.object({
    _id: z.string().uuid().optional(),
    name: z.string(),
    time: z.string().optional(),
    done: z.boolean().optional(),
  })).optional(),
});

export const createRepSchema = z.object({
  text: z.string().min(1).max(300),
  tier: z.number().int().min(0).max(2).optional(),
  active: z.boolean().optional(),
});

export const updateRepSchema = z.object({
  text: z.string().min(1).max(300).optional(),
  tier: z.number().int().min(0).max(2).optional(),
  active: z.boolean().optional(),
});

export const putDraftsSchema = z.object({
  planner: z.string().max(8000).optional(),
  coach: z.string().max(8000).optional(),
});
