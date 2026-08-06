import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => {
  vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
  vi.stubEnv('OPENROUTER_MODEL', 'test-model');
  vi.resetModules();
});

describe('openrouter complete', () => {
  it('returns content on 200', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'hello' }, finish_reason: 'stop' }] }),
    });
    global.fetch = fetchMock;

    const { complete } = await import('../src/lib/openrouter.js');
    const r = await complete({ messages: [{ role: 'user', content: 'hi' }], maxTokens: 100, endpoint: 'test' });
    expect(r.ok).toBe(true);
    expect(r.content).toBe('hello');
  });

  it('returns error on missing API key', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '');
    const { complete } = await import('../src/lib/openrouter.js');
    const r = await complete({ messages: [], maxTokens: 100, endpoint: 'test' });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(503);
  });

  it('retries once on length-finish with no content', async () => {
    const failOnce = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ choices: [{ message: { content: '' }, finish_reason: 'length' }] }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ choices: [{ message: { content: 'full output' }, finish_reason: 'stop' }] }),
      });
    global.fetch = failOnce;
    const { complete } = await import('../src/lib/openrouter.js');
    const r = await complete({ messages: [], maxTokens: 100, endpoint: 'test' });
    expect(r.ok).toBe(true);
    expect(r.retried).toBe(true);
    expect(r.content).toBe('full output');
  });
});
