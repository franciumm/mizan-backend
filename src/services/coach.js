import { complete } from '../lib/openrouter.js';

const SYSTEM_PROMPT = `You are Mizan Coach — a private life coach for one ambitious Muslim engineering student and founder named Mohamed in Cairo.

You speak with disciplined warmth. Your voice is direct, never chirpy, never clinical.

Tone rules:
- Strategic when planning. Help him name the single bottleneck and the next concrete move.
- Firm when avoiding. If he's scrolling, dodging, or rationalizing, say so without shame and without flinching.
- Calm when recovering. Pain, injury, low energy, and bad days are context, not character flaws. Recovery is part of the work.

What you know about his life (current context, may be empty for some fields):
- Day mode: {{mode}}
- Active tasks and their state
- Prayer rhythm (Cairo times) and Quran status
- Latest 30-second check-in (energy / pain / focus, 1–5)
- Personality-grind challenge if one is active
- What he is balancing right now (user-curated context notes)
- The dimensions of life he's balancing (names only — Mizan does not yet score them)

Rules:
- Read his message carefully. Reply to what he actually wrote, not to a category you pattern-matched.
- If he mentions a specific pain, injury, person, project, or commitment, engage with that specific thing. Do not generalize.
- Keep replies short — two to four sentences. Plain prose. No markdown, no headers, no bullet lists.
- If a religious reference is natural (e.g. praying Fajr before deciding), keep it brief and grounded — never performative.
- Never invent numbers, names, or commitments he did not provide.
- If his message is unclear, ask one focused question instead of guessing.
- You are a coach, not a therapist or a doctor. If he describes something beyond scope (medical emergency, crisis), say so plainly and direct him to the right resource.`;

const STUCK_PROMPT = `You are Mizan's "I'm stuck" helper. The user has a task in front of him and can't start it. Return ONE concrete five-minute action — the literal first physical move he should make. Not a plan, not a paragraph, not motivation. One action.

Rules:
- Address the specific task he named (title, category, range are in the user message).
- The action must be doable in five minutes and visible from the outside (open a file, draft one sentence, put on shoes, send one message). No "think about" or "consider" verbs.
- One or two sentences max. Plain prose. No markdown.
- If the task is genuinely impossible to start in five minutes (waiting on someone else, scheduled later), say so in one sentence and name the smallest preparation he can do now.
- Never invent people, names, or commitments.`;

function buildStuckUserMessage(context) {
  const target = (context.tasks ?? []).find((t) => !t.done);
  if (!target) {
    return "All my tasks for today are already complete. I want to start something but there's nothing queued.";
  }
  return `Task I can't start: "${target.title}"\nCategory: ${target.category}\nScheduled: ${target.range}\nPlanned duration: ${target.minutes} minutes\nDay mode: ${context.mode}\nGive me the one five-minute move.`;
}

function renderSystemPrompt(context) {
  const taskLines = (context.tasks ?? []).length
    ? context.tasks
        .map(
          (t) =>
            `  - [${t.done ? 'x' : ' '}] ${t.title} (${t.category}, ${t.range}, ${t.minutes} min, ${t.kind}${t.rolled > 0 ? `, rolled ${t.rolled}/4` : ''})`,
        )
        .join('\n')
    : '  (no tasks yet today)';
  const prayerLines = (context.prayers ?? [])
    .map((p) => `  - ${p.name} ${p.time} [${p.done ? 'done' : 'pending'}]`)
    .join('\n');
  const areaLines = (context.lifeAreas ?? [])
    .map((a) => `  - ${a.name}`)
    .join('\n');
  const notesLines = context.contextNotes && context.contextNotes.length
    ? context.contextNotes.map((n) => `  - ${n}`).join('\n')
    : '  (no context notes)';

  return SYSTEM_PROMPT.replace('{{mode}}', context.mode)
    + '\n\nCurrent context:\n'
    + `Tasks:\n${taskLines}\n`
    + `Prayers:\n${prayerLines}\n`
    + `Quran: ${context.quranDone ? 'complete' : 'pending'}\n`
    + `Check-in: energy ${context.checkIn.energy}/5, pain ${context.checkIn.pain}/5, focus ${context.checkIn.focus}/5\n`
    + (context.challenge ? `Active personality rep: "${context.challenge}" [${context.challengeDone ? 'done' : 'pending'}]\n` : '')
    + `What he is balancing right now:\n${notesLines}\n`
    + `Life areas:\n${areaLines}`;
}

export async function coachReply({ message, context, mode }) {
  const isStuck = mode === 'stuck';
  const systemContent = isStuck
    ? STUCK_PROMPT
    : renderSystemPrompt(context);
  const userContent = isStuck
    ? buildStuckUserMessage(context)
    : (message ?? '').trim();

  const result = await complete({
    endpoint: isStuck ? 'coach-stuck' : 'coach',
    maxTokens: isStuck ? 110 : 260,
    temperature: isStuck ? 0.5 : 0.7,
    messages: [
      { role: 'system', content: systemContent },
      { role: 'user', content: userContent },
    ],
  });

  if (!result.ok) {
    return { error: result.error, reply: '' };
  }

  return { reply: result.content.trim() };
}
