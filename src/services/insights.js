import { completeJson } from '../lib/openrouter.js';
import { InsightCache } from '../db/schema.js';

const SYSTEM_PROMPT = `You are Mizan's insights engine. You receive one user's actual state for today, along with recent history (last 7 days), and produce calm, factual commentary as strict JSON.

Voice: calm, factual, never scolding. "Your behavior is data, not a verdict."
- Use only the numbers you were explicitly given (focus minutes, prayer count, check-in scores, past tasks). Never invent statistics.
- The life-area names you receive are the dimensions of life to comment on — they currently carry no score, because Mizan does not yet compute one. Speak to each area from the day's actual activity OR recent history trends, not from a missing number. You MUST return exactly one entry in the lifeMap array for EVERY life area provided in the input, even if there is little data.
- Headline (2-6 words): the single truest thing about today's pattern or recent trend.
- Stat (1 sentence): the supporting number or contrast, plainly stated.
- Risk (1-2 sentences): the most useful warning, grounded in the data.
- lifeMap: one short insight per area, derived from today's actual activity or recent history in that category. Plain prose, no markdown, max ~22 words. Be specific to the area — do not template.`;

const insightsSchema = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    stat: { type: 'string' },
    risk: { type: 'string' },
    lifeMap: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          insight: { type: 'string' },
        },
        required: ['name', 'insight'],
        additionalProperties: false,
      },
    },
  },
  required: ['headline', 'stat', 'risk', 'lifeMap'],
  additionalProperties: false,
};

function describeContext(context) {
  const tasksDone = (context.tasks ?? []).filter((t) => t.done);
  const tasksPending = (context.tasks ?? []).filter((t) => !t.done);
  const focusMinutes = tasksDone.reduce((sum, t) => sum + t.minutes, 0);
  const prayerDone = (context.prayers ?? []).filter((p) => p.done).length;
  const areas = (context.lifeAreas ?? []).map((a) => a.name).join(', ');
  const doneList = tasksDone.length
    ? tasksDone.map((t) => `"${t.title}" (${t.category}, ${t.minutes}m)`).join(', ')
    : '(none yet)';
  const pendingList = tasksPending.length
    ? tasksPending.map((t) => `"${t.title}" (${t.category})`).join(', ')
    : '(none)';

  const historyDesc = (context.pastTasks ?? [])
    .map((day) => {
      const done = day.tasks.filter((t) => t.done).length;
      return `${day.dateKey}: ${done} tasks done`;
    })
    .join(' | ');

  return [
    `Day mode: ${context.mode}`,
    `Tasks done today: ${doneList}`,
    `Tasks pending/rolled: ${pendingList}`,
    `Focus minutes today: ${focusMinutes} / 240 target`,
    `Prayers done: ${prayerDone} / 5`,
    `Quran done: ${context.quranDone ? 'yes' : 'no'}`,
    `Check-in: energy ${context.checkIn.energy}/5, pain ${context.checkIn.pain}/5, focus ${context.checkIn.focus}/5`,
    `Life areas: ${areas}`,
    `Recent history (last 7 days): ${historyDesc || '(no history)'}`,
  ].join('\n');
}

function isEmpty(context) {
  const noTasksDone = !(context.tasks ?? []).some((t) => t.done);
  const defaultCheckIn =
    context.checkIn.energy === 3 && context.checkIn.pain === 2 && context.checkIn.focus === 3;
  const noHistory = (context.pastTasks ?? []).length === 0;
  return noTasksDone && defaultCheckIn && noHistory;
}

const DEFAULT_AREA_NAMES = ['Faith', 'Health', 'Business', 'College', 'Mind', 'Family', 'Personality'];

function emptyStateResponse(context) {
  const names = (context.lifeAreas ?? []).length
    ? context.lifeAreas.map((a) => a.name)
    : DEFAULT_AREA_NAMES;
  return {
    headline: 'Not enough data yet',
    stat: 'Check in for a few days and complete real tasks — Mizan will start reading your patterns from there.',
    risk: '',
    lifeMap: names.map((name) => ({
      name,
      insight: 'Needs more days of check-ins to read.',
    })),
    emptyState: true,
  };
}

export async function generateInsights({ context, weekKey, force }) {
  // 1. If not forcing and we have a weekKey, try the database cache first
  if (!force && weekKey) {
    const cached = await InsightCache.findById(weekKey);
    if (cached && cached.data) {
      return cached.data;
    }
  }

  // 2. Otherwise compute fresh insights
  if (isEmpty(context)) {
    return emptyStateResponse(context);
  }

  const result = await completeJson({
    endpoint: 'insights',
    maxTokens: 700,
    temperature: 0.5,
    jsonSchema: { name: 'mizan_insights', schema: insightsSchema },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: describeContext(context) },
    ],
  });

  if (!result.ok) {
    return {
      headline: 'Patterns forming',
      stat: "Mizan couldn't reach the analysis engine this time. Your day is still tracked; insights will refresh on the next call.",
      risk: '',
      lifeMap: (context.lifeAreas ?? []).map((a) => ({
        name: a.name,
        insight: 'Insight engine offline — refresh later.',
      })),
      fallback: true,
      error: result.error,
    };
  }

  // Map model output onto the same areas we were given, preserving order.
  const byName = new Map(result.value.lifeMap.map((entry) => [entry.name.toLowerCase(), entry.insight]));
  const lifeMap = (context.lifeAreas ?? []).map((area) => ({
    name: area.name,
    insight: (byName.get(area.name.toLowerCase()) ?? 'Needs more days of check-ins to read.').slice(0, 240),
  }));

  const finalResult = {
    headline: String(result.value.headline || 'Today').slice(0, 90),
    stat: String(result.value.stat || '').slice(0, 320),
    risk: String(result.value.risk || '').slice(0, 360),
    lifeMap,
  };

  // 3. Save successful generations to the cache if a weekKey was provided
  if (weekKey) {
    await InsightCache.findByIdAndUpdate(weekKey, { data: finalResult }, { upsert: true });
  }

  return finalResult;
}
