import { z } from 'zod';

export const statuses = ['IDEA', 'RESEARCHING', 'READY TO SCRIPT', 'READY TO FILM', 'FILMED', 'EDITING', 'READY', 'SCHEDULED', 'PUBLISHED', 'REVIEWED', 'REPURPOSE', 'ARCHIVED'];
const date = z.iso.date().nullable().default(null);
const note = z.string().max(20000).default('');
const metric = z.number().finite().nonnegative().nullable().default(null);
const url = z.union([z.literal(''), z.url().refine(v => ['http:', 'https:'].includes(new URL(v).protocol), 'Use an http or https link')]).default('');
export const metricsSchema = z.object(Object.fromEntries([
  'views', 'reach', 'watchTimeSeconds', 'averagePercentageViewed', 'completionRate', 'rewatches', 'likes', 'comments', 'shares', 'saves', 'profileVisits', 'followersGained', 'returningViewers', 'websiteVisits', 'waitlistConversions', 'leads', 'founderConversations', 'serviceRequests', 'customers', 'attributedRevenue',
].map(key => [key, metric]))).strict();
const publication = z.object({
  platform: z.enum(['TikTok', 'Instagram Reels', 'YouTube Shorts']),
  status: z.enum(['DRAFT', 'SCHEDULED', 'PUBLISHED']).default('DRAFT'),
  url, date, measuredAt: date, metrics: metricsSchema.default(() => metricsSchema.parse({})), notes: note,
}).strict().superRefine((v, ctx) => {
  if (v.status !== 'DRAFT' && !v.date) ctx.addIssue({ code: 'custom', message: 'Set a date for each scheduled or published upload.' });
});
export const assetSchema = z.object({
  identity: z.enum(['enzo', 'hustliq']), title: z.string().trim().min(1).max(300),
  territory: z.string().max(200).default(''), format: z.string().max(200).default(''),
  status: z.enum(statuses).default('IDEA'), priority: z.enum(['Normal', 'High', 'Low']).default('Normal'),
  timing: z.enum(['Unclassified', 'Evergreen', 'Timely']).default('Unclassified'),
  source: note, experiment: note, research: note, assets: note, evidence: note,
  privacy: z.enum(['Needs review', 'Public material', 'Anonymized', 'Permission confirmed', 'Private — do not publish']).default('Needs review'),
  hooks: note, script: note, editorBrief: note, notes: note, followUp: note,
  series: z.string().max(200).default(''), relatedIds: z.array(z.string().max(100)).max(100).default([]),
  filmingDate: date, scheduledDate: date,
  editorStatus: z.enum(['Not assigned', 'Queued', 'Editing', 'Needs revision', 'Delivered']).default('Not assigned'),
  productionMinutes: metric,
  publications: z.array(publication).length(3).default(() => ['TikTok', 'Instagram Reels', 'YouTube Shorts'].map(platform => publication.parse({ platform }))),
}).strict().superRefine((v, ctx) => {
  if (new Set(v.publications.map(p => p.platform)).size !== 3) ctx.addIssue({ code: 'custom', message: 'Keep one upload record per platform.' });
  if (v.status === 'SCHEDULED' && !v.scheduledDate) ctx.addIssue({ code: 'custom', message: 'Choose a planned publication date before marking the asset scheduled.' });
  if (['PUBLISHED', 'REVIEWED'].includes(v.status) && !v.publications.some(p => p.status === 'PUBLISHED')) ctx.addIssue({ code: 'custom', message: 'Record at least one published platform upload first.' });
  if (v.privacy === 'Private — do not publish' && (['SCHEDULED', 'PUBLISHED', 'REVIEWED'].includes(v.status) || v.publications.some(p => p.status !== 'DRAFT'))) ctx.addIssue({ code: 'custom', message: 'Resolve private material before scheduling or publishing.' });
});
export const settingsSchema = z.object({
  startDate: date,
  enzoWeekly: z.number().int().min(0).max(30).default(5), hustliqWeekly: z.number().int().min(0).max(30).default(4),
  dailyMinutes: z.number().int().min(0).max(1440).default(120),
  firstRecordingMinutes: z.number().int().min(0).max(1440).default(180),
  firstRecordingDate: date,
  editorAvailableUntil: date,
  editorTurnaroundDays: z.number().min(0).max(30).default(3),
  backlogTarget: z.number().int().min(0).max(100).default(10),
  notes: note,
}).strict();
