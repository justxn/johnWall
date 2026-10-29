import { describe, expect, it } from 'vitest';
import { fmtClock, fmtDate, fmtTime, initials, normName, plural, todayISO } from '../src/util.js';

describe('dates and times', () => {
  it('formats local dates as YYYY-MM-DD', () => {
    expect(todayISO(new Date(2026, 10, 4))).toBe('2026-11-04');
  });

  it('drops the year for this year only', () => {
    const year = new Date().getFullYear();
    expect(fmtDate(`${year}-03-05`)).not.toContain(String(year));
    expect(fmtDate(`${year - 1}-03-05`)).toContain(String(year - 1));
    expect(fmtDate('')).toBe('');
  });

  it('formats 24h times for display', () => {
    expect(fmtTime('18:30')).toMatch(/^6:30\sPM$/);
    expect(fmtTime('')).toBe('');
  });

  it('formats the game clock', () => {
    expect(fmtClock(754_000)).toBe('12:34');
    expect(fmtClock(5_000)).toBe('0:05');
    expect(fmtClock(-1)).toBe('0:00');
  });
});

describe('text helpers', () => {
  it('normalizes names for matching', () => {
    expect(normName('  Air   BALLERS ')).toBe('air ballers');
  });
  it('builds initials', () => {
    expect(initials('Christopher Alvarez')).toBe('CA');
    expect(initials('')).toBe('?');
  });
  it('pluralizes', () => {
    expect(plural(1, 'game')).toBe('1 game');
    expect(plural(2, 'game')).toBe('2 games');
  });
});
