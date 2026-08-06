// Reads OPENROUTER_API_KEY and OPENROUTER_MODEL lazily from process.env
// so tests can stub them without triggering the eager-throw in env.js.

const URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * @typedef {{ role: 'system'|'user'|'assistant', content: string }} Message
 */

/**
 * @param {{
 *   messages: Message[],
 *   maxTokens: number,
 *   jsonSchema?: { name: string, schema: object },
 *   temperature?: number,
 *   endpoint: string,
 * }} opts
 */
export async function complete(opts) {
  const apiKey = (process.env.OPENROUTER_API_KEY ?? '').trim();
  if (!apiKey) return { ok: false, status: 503, error: 'OPENROUTER_API_KEY not configured' };

  const first = await callOnce(apiKey, opts, opts.maxTokens);
  if (first.ok) return first;
  if (first.error !== 'retry') return first;

  const retry = await callOnce(apiKey, opts, opts.maxTokens * 2);
  if (retry.ok) return { ...retry, retried: true };
  return retry;
}

async function callOnce(apiKey, opts, maxTokens) {
  const body = {
    model: process.env.OPENROUTER_MODEL ?? 'deepseek/deepseek-v4-flash',
    messages: opts.messages,
    max_tokens: maxTokens,
    temperature: opts.temperature ?? 0.6,
  };
  if (opts.jsonSchema) {
    body.response_format = {
      type: 'json_schema',
      json_schema: { name: opts.jsonSchema.name, strict: true, schema: opts.jsonSchema.schema },
    };
  }

  let res;
  try {
    res = await fetch(URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://mizan.local',
        'X-Title': 'Mizan',
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, status: 502, error: `Network error (${opts.endpoint}): ${e.message}` };
  }

  if (!res.ok) {
    const detail = await safeText(res);
    return { ok: false, status: res.status, error: `OpenRouter ${opts.endpoint} failed (${res.status}): ${detail.slice(0, 280)}` };
  }

  let payload;
  try { payload = await res.json(); }
  catch { return { ok: false, status: 502, error: `OpenRouter ${opts.endpoint} returned non-JSON` }; }

  const choice = payload?.choices?.[0];
  const content = choice?.message?.content ?? '';
  const finishReason = choice?.finish_reason ?? 'unknown';

  if ((!content || finishReason === 'length') && maxTokens < 4096) {
    return { ok: false, status: 200, error: 'retry', content: '', finishReason };
  }
  if (!content) {
    return { ok: false, status: 502, error: `OpenRouter ${opts.endpoint} returned empty completion` };
  }
  return { ok: true, content, finishReason, retried: false };
}

async function safeText(res) {
  try { return await res.text(); } catch { return '<no body>'; }
}

export async function completeJson(opts) {
  const r = await complete(opts);
  if (!r.ok) return r;
  try {
    return { ok: true, value: JSON.parse(r.content), retried: r.retried };
  } catch {
    return { ok: false, status: 502, error: `OpenRouter ${opts.endpoint} returned non-JSON content: ${r.content.slice(0, 200)}` };
  }
}
