import { z } from 'zod';

const note = z.string().max(20000).default('');
const title = z.string().trim().min(1, 'Add a title.').max(300);
const ids = z.array(z.string().min(1).max(100)).max(100).refine(v => new Set(v).size === v.length, 'Choose each event once.').default([]);
const date = z.iso.date().nullable().default(null);
const links = z.array(z.object({
  label: title,
  url: z.url().max(2048).refine(v => ['http:', 'https:'].includes(new URL(v).protocol), 'Use an http or https link.'),
}).strict()).max(30).default([]);

export const eventSchema = z.object({
  title, chapter: z.string().trim().max(120).default(''),
  type: z.enum(['Decision', 'Experiment', 'Discovery', 'Milestone', 'Pause', 'Review', 'Small change']).default('Decision'),
  status: z.enum(['Planned', 'Ongoing', 'Recorded', 'Superseded', 'Archived']).default('Recorded'),
  order: z.number().int().nonnegative().max(1000000).default(0), date,
  happened: note, significance: note, changed: note,
  beliefBefore: note, alternatives: note, expectation: note, successCriteria: note,
  result: note, learning: note, nextStep: note, evidence: note,
  signal: z.enum(['Not assessed', 'Supports', 'Challenges', 'Mixed']).default('Not assessed'),
  parentIds: ids, links,
  updates: z.array(z.object({ id: z.string().min(1).max(100), text: z.string().trim().min(1).max(20000), date }).strict()).max(1000).default([]),
  source: note,
}).strict();

export const playbookSchema = z.object({
  title, status: z.enum(['Draft', 'In use', 'Retired']).default('Draft'),
  purpose: note, whenToUse: note, prerequisites: note, steps: note,
  expectedOutput: note, pitfalls: note, assumptions: note, changeNotes: note,
  sourceEventIds: ids, links,
}).strict();

export const overviewSchema = z.object({
  purpose: note, focus: note, customer: note, problem: note, offer: note,
  openQuestions: note, nextTest: note,
}).strict();
