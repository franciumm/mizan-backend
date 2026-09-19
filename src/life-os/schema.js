import { z } from 'zod';

const text = z.string().max(20000).default('');
const shortText = z.string().max(500).default('');
const nonnegative = (max = 600) => z.number().int().min(0).max(max).default(0);
const score = (max, fallback) => z.number().int().min(0).max(max).default(fallback);
const yesNoNA = z.enum(['na', 'yes', 'no']).default('na');
const outcome = z.enum(['', 'yes', 'partial', 'no']).default('');

export const dateKeySchema = z.iso.date();

export const dailyEntrySchema = z.object({
  dayType: z.enum(['home', 'content', 'short-college', 'long-college', 'social', 'recovery']).default('home'),
  mustWin: shortText,
  supports: z.tuple([shortText, shortText]).default(['', '']),
  growth: shortText,
  fun: shortText,
  done: z.record(z.string().max(100), z.boolean()).default({}),
  morning: z.record(z.string().max(500), z.boolean()).default({}),
  scrollMinutes: nonnegative(),
  focusResult: text,
  focusMinutes: z.union([z.literal(45), z.literal(90)]).default(90),
  focusOutcome: outcome,
  codeMinutes: nonnegative(180),
  codeFile: shortText,
  codeResponsibility: text,
  codeInput: text,
  codeOutput: text,
  codeDependencies: text,
  codeGap: text,
  codeExplanation: text,
  codeConfidence: score(5, 3).refine(value => value >= 1, 'Code confidence must be between 1 and 5.'),
  filesUnderstood: nonnegative(30),
  aiUnderstanding: z.enum(['yes', 'mostly', 'no']).default('mostly'),
  aiChange: text,
  contentPersonal: nonnegative(20),
  contentHustliq: nonnegative(20),
  collegeMinutes: nonnegative(),
  japaneseMinutes: nonnegative(),
  meaningfulConversation: z.boolean().default(false),
  socialAdventure: yesNoNA,
  rehab: yesNoNA,
  gym: yesNoNA,
  movement: z.enum(['low', 'medium', 'good']).default('medium'),
  impulseOutcome: outcome,
  emotions: z.object({ anxiety: score(10, 5), numbness: score(10, 5), motivation: score(10, 5), focus: score(10, 5), confidence: score(10, 5), loneliness: score(10, 5), mood: score(10, 5) }).strict(),
  reviewWorked: text,
  reviewFailed: text,
  reviewDistraction: text,
  reviewChange: text,
  balance: z.object({
    hustliq: score(5, 0), college: score(5, 0), mental: score(5, 0), physical: score(5, 0),
    content: score(5, 0), relationships: score(5, 0), learning: score(5, 0), recreation: score(5, 0),
  }).strict(),
  commuteMode: z.string().max(100).default(''),
  funChoices: z.array(z.string().max(100)).max(10).default([]),
}).strict();

export const episodeSchema = z.object({
  id: z.string().uuid(), dateKey: dateKeySchema,
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a valid 24-hour time.'),
  location: shortText, before: text, trigger: text,
  emotion: z.string().max(100).default('unknown'), intensity: score(10, 5),
  interrupted: z.boolean().default(false), replacement: text, note: text,
}).strict();

export const lifeOSStoreSchema = z.object({
  version: z.literal(1),
  days: z.record(dateKeySchema, dailyEntrySchema).refine(value => Object.keys(value).length <= 3660, 'Life OS can store up to ten years of daily records.'),
  episodes: z.array(episodeSchema).max(250),
}).strict();

export const emptyLifeOSStore = () => ({ version: 1, days: {}, episodes: [] });
