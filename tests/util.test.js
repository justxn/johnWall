import { describe, expect, it } from 'vitest';
import { andList, dayLabel, fmtClock, fmtDate, fmtTime, initials, normName, plural, timeAgo, timeLeft, todayISO } from '../src/util.js';

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

  it('calls recent days Today and Yesterday, even across a month', () => {
    expect(dayLabel('2026-11-10', '2026-11-10')).toBe('Today');
    expect(dayLabel('2026-10-31', '2026-11-01')).toBe('Yesterday');
    expect(dayLabel('2026-11-04', '2026-11-10')).toBe(fmtDate('2026-11-04'));
    expect(dayLabel('', '2026-11-10')).toBe('');
  });

  it('says how long ago, briefly', () => {
    const now = new Date(2026, 10, 10, 12).getTime();
    expect(timeAgo(now - 20_000, now)).toBe('now');
    expect(timeAgo(now - 5 * 60_000, now)).toBe('5m');
    expect(timeAgo(now - 3 * 3_600_000, now)).toBe('3h');
    expect(timeAgo(now - 2 * 86_400_000, now)).toBe('2d');
    expect(timeAgo(new Date(2026, 9, 1).getTime(), now)).toBe(fmtDate('2026-10-01', { weekday: false }));
  });

  it('rounds time left up to the minute, then to hours and days', () => {
    expect(timeLeft(30_000)).toBe('1 min');
    expect(timeLeft(45 * 60_000)).toBe('45 min');
    expect(timeLeft(26 * 3_600_000)).toBe('26 hr');
    expect(timeLeft(3 * 86_400_000)).toBe('3 days');
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
  it('lists things the way you would say them', () => {
    expect(andList([])).toBe('');
    expect(andList(['a'])).toBe('a');
    expect(andList(['a', 'b'])).toBe('a and b');
    expect(andList(['a', 'b', 'c'])).toBe('a, b and c');
  });
});
