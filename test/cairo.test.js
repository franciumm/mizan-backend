import { describe, it, expect } from 'vitest';
import { cairoDateKey, cairoDateAddDays } from '../src/lib/cairo.js';

describe('cairoDateKey', () => {
  it('formats a known UTC instant as Cairo date', () => {
    // 2026-08-06 22:00 UTC = 2026-08-07 00:00 Cairo (UTC+2)
    const d = new Date('2026-08-06T22:00:00Z');
    expect(cairoDateKey(d)).toBe('2026-08-07');
  });

  it('keeps the same day before midnight Cairo', () => {
    const d = new Date('2026-08-06T20:59:00Z');
    expect(cairoDateKey(d)).toBe('2026-08-06');
  });
});

describe('cairoDateAddDays', () => {
  it('adds days across month boundary', () => {
    expect(cairoDateAddDays(new Date('2026-08-31T10:00:00Z'), 1)).toBe('2026-09-01');
  });
  it('subtracts days via negative input', () => {
    expect(cairoDateAddDays(new Date('2026-08-01T10:00:00Z'), -1)).toBe('2026-07-31');
  });
});
