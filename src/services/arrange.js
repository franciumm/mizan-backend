import { completeJson } from '../lib/openrouter.js';

const SYSTEM_PROMPT = `You are Mizan's planning assistant. The user (Mohamed, Cairo) brain-dumps what's on his mind for tomorrow. You produce a clean, ordered day plan as strict JSON.

Hard rules:
- Read the brain-dump carefully. If the user named a specific time ("at 2pm", "after Asr", "before Maghrib", "9 AM sharp"), the task range MUST reflect that time. This is the most important rule.
- If he named a fixed commitment (lecture, physio appointment, call), put it at its stated time and build the rest of the day around it.
- Order the remaining work by leverage: deep focus first, then shallow work, then learning and recovery. Protect prayer blocks (Fajr ~dawn, Dhuhr ~midday, Asr ~afternoon, Maghrib ~sunset, Isha ~night) — don't schedule hard focus across them.
- Two to three "mission" tasks (real outcomes), the rest "support". Cap at 5 tasks total.
- Titles: short, plain imperative prose. No markdown, no quotes, no emoji, no leading numbers. Max ~70 chars.
- "range": human-readable window in 12-hour clock with am/pm, e.g. "10:30 am – 1:00 pm". Required, even for unspecific tasks ("morning", "after Asr" is fine).
- "minutes": realistic focus duration in integer minutes (30, 45, 60, 90, 120, 150).
- "category": exactly one of "Business", "Health", "Faith", "College", "Mind", "Personality", "Family".
- "kind": "mission" for the 2–3 outcomes that matter most today, "support" for everything else.
- "overallReasoning": 1–3 sentences explaining the order and trade-offs. Plain prose. Reference specific tasks, not abstract principles.
- Do not invent tasks the user did not mention. If the brain-dump is empty or pure venting, return an empty tasks array and explain in overallReasoning.`;

const arrangeSchema = {
  type: 'object',
  properties: {
    tasks: {
      type: 'array', maxItems: 5,
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          category: { type: 'string', enum: ['Business', 'Health', 'Faith', 'College', 'Mind', 'Personality', 'Family'] },
          range: { type: 'string' },
          minutes: { type: 'number' },
          kind: { type: 'string', enum: ['mission', 'support'] },
        },
        required: ['title', 'category', 'range', 'minutes', 'kind'],
        additionalProperties: false,
      },
    },
    overallReasoning: { type: 'string' },
  },
  required: ['tasks', 'overallReasoning'],
  additionalProperties: false,
};

function ruleBasedFallback(brainDump) {
  const lines = brainDump
    .split(/\n|,/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 5);
  const source = lines.length
    ? lines
    : ['Find three real beta testers', 'Record one clear UGC video', 'Complete rehabilitation and reading'];
  const ranges = ['10:30 am – 1:00 pm', '4:30 pm – 6:00 pm', '8:30 pm – 10:00 pm', '2:00 pm – 3:00 pm', '6:30 pm – 7:15 pm'];
  const categorize = (title) => {
    if (/prayer|quran|fajr|dhuhr|asr|maghrib|isha/i.test(title)) return 'Faith';
    if (/rehab|health|run|sleep|physio|adductor|steps/i.test(title)) return 'Health';
    if (/study|college|exam|assignment|lecture/i.test(title)) return 'College';
    if (/speak|call|camera|pitch|social|network/i.test(title)) return 'Personality';
    if (/japanese|learn|read|meditat|research/i.test(title)) return 'Mind';
    return 'Business';
  };
  return {
    tasks: source.map((title, index) => ({
      title,
      category: categorize(title),
      range: ranges[index] ?? 'Flexible',
      minutes: index === 0 ? 150 : index === 1 ? 90 : 60,
      kind: index < 2 ? 'mission' : 'support',
    })),
    overallReasoning:
      'Offline arrangement: tasks ordered by leverage — deep focus first, then supporting work. Time windows are placeholders; edit any that conflict with a real commitment.',
  };
}

function describeContext(ctx) {
  const parts = [`Day mode he's planning for: ${ctx.mode}`];
  if (ctx.checkIn) {
    parts.push(`Today's check-in: energy ${ctx.checkIn.energy}/5, pain ${ctx.checkIn.pain}/5, focus ${ctx.checkIn.focus}/5 — use this to gauge realistic load.`);
  }
  const incomplete = (ctx.tasks ?? []).filter((t) => !t.done).slice(0, 4);
  if (incomplete.length) {
    parts.push(
      'Unfinished today (consider rolling forward if relevant): '
        + incomplete.map((t) => `"${t.title}" (${t.category})`).join(', '),
    );
  }
  return parts.join('\n');
}

export async function arrangePlan({ brainDump, context }) {
  const dump = (brainDump ?? '').trim();
  if (dump.length > 4000) throw new Error('brainDump too long');

  const userPrompt = `Brain-dump:\n"""\n${dump || '(empty — he opened the planner without writing anything yet)'}\n"""\n\n` + describeContext(context);
  const result = await completeJson({
    endpoint: 'arrange',
    maxTokens: 900,
    temperature: 0.4,
    jsonSchema: { name: 'mizan_arrange_plan', schema: arrangeSchema },
    messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userPrompt }],
  });

  if (!result.ok) {
    return { plan: ruleBasedFallback(dump), fallback: true, error: result.error };
  }

  const cleaned = {
    tasks: (result.value.tasks ?? []).slice(0, 5).filter((t) => t.title && t.category && t.range).map((t) => ({
      title: String(t.title).slice(0, 120),
      category: t.category,
      range: String(t.range).slice(0, 40),
      minutes: Number.isFinite(t.minutes) ? Math.max(15, Math.min(240, Math.round(t.minutes))) : 60,
      kind: t.kind === 'mission' ? 'mission' : 'support',
    })),
    overallReasoning: String(result.value.overallReasoning ?? '').slice(0, 600),
  };

  if (!cleaned.tasks.length) {
    return { plan: ruleBasedFallback(dump), fallback: true, error: 'Model returned empty plan' };
  }
  return { plan: cleaned };
}
