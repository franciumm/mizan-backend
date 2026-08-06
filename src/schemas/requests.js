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
