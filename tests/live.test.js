import { describe, expect, it } from 'vitest';
import { clockMs, clockToggle, courtToggle, courtUsed, finalMinutes, playedMs, plusMinusCourt } from '../src/live.js';

// Applies a { set, remove } update to a plain object, the way Firestore would.
function apply(doc, { set, remove }) {
  const out = structuredClone(doc);
  const walk = (path, fn) => {
    const keys = path.split('.');
    let o = out;
    for (const k of keys.slice(0, -1)) o = o[k] ??= {};
    fn(o, keys.at(-1));
  };
  for (const [path, value] of Object.entries(set)) walk(path, (o, k) => { o[k] = value; });
  for (const path of remove) walk(path, (o, k) => { delete o[k]; });
  return out;
}

const MIN = 60_000;

describe('game clock', () => {
  it('only advances while running', () => {
    let doc = { live: { clockBase: 0, clockStartedAt: null, onCourt: {}, played: {} } };
    expect(clockMs(doc.live, 1_000)).toBe(0);
    doc = apply(doc, clockToggle(doc.live, 1_000)); // start
    expect(clockMs(doc.live, 1_000 + 5 * MIN)).toBe(5 * MIN);
    doc = apply(doc, clockToggle(doc.live, 1_000 + 5 * MIN)); // pause
    expect(clockMs(doc.live, 1_000 + 60 * MIN)).toBe(5 * MIN);
  });
});

describe('minutes', () => {
  it('counts game-clock time on court across subs and pauses', () => {
    const t0 = 1_000_000;
    let doc = { live: { clockBase: 0, clockStartedAt: null, onCourt: {}, played: {} } };
    doc = apply(doc, courtToggle(doc.live, 'a', t0)); // a starts on court
    doc = apply(doc, clockToggle(doc.live, t0)); // tip off
    doc = apply(doc, courtToggle(doc.live, 'b', t0 + 4 * MIN)); // b comes in at 4:00
    doc = apply(doc, clockToggle(doc.live, t0 + 6 * MIN)); // timeout at 6:00
    expect(playedMs(doc.live, 'a', t0 + 30 * MIN)).toBe(6 * MIN); // clock stopped, so no time added
    doc = apply(doc, clockToggle(doc.live, t0 + 30 * MIN)); // restart
    doc = apply(doc, courtToggle(doc.live, 'a', t0 + 32 * MIN)); // a subs out at 8:00
    expect(playedMs(doc.live, 'a', t0 + 40 * MIN)).toBe(8 * MIN);
    expect(playedMs(doc.live, 'b', t0 + 40 * MIN)).toBe(12 * MIN); // in since 4:00, clock now 16:00
    expect(finalMinutes(doc.live, ['a', 'b', 'c'], t0 + 40 * MIN)).toEqual({ a: 8, b: 12, c: 0 });
  });

  it('rounds to whole minutes', () => {
    const live = { clockBase: 90_000, clockStartedAt: null, onCourt: { a: 0 }, played: {} };
    expect(finalMinutes(live, ['a'])).toEqual({ a: 2 });
  });
});

describe('plus-minus', () => {
  const fresh = (tracked = ['points', 'plusMinus']) => ({ live: { clockBase: 0, clockStartedAt: null, onCourt: {}, played: {}, tracked } });
  const everyone = ['a', 'b', 'c'];

  it('gives each basket to whoever is on the court at the time', () => {
    const pm = { a: 0, b: 0, c: 0 };
    const basket = (doc, n) => plusMinusCourt(doc.live, everyone).forEach((id) => { pm[id] += n; });
    let doc = fresh();
    doc = apply(doc, courtToggle(doc.live, 'a', 0));
    doc = apply(doc, courtToggle(doc.live, 'b', 0));
    basket(doc, 2); // we score 2 with a and b out there
    doc = apply(doc, courtToggle(doc.live, 'b', 0)); // b subs out...
    doc = apply(doc, courtToggle(doc.live, 'c', 0)); // ...for c
    basket(doc, -3); // they score 3
    expect(pm).toEqual({ a: -1, b: 2, c: -3 });
  });

  it('does nothing when plus-minus is not tracked', () => {
    let doc = fresh(['points', 'minutes']);
    doc = apply(doc, courtToggle(doc.live, 'a', 0));
    expect(plusMinusCourt(doc.live, everyone)).toEqual([]);
    expect(plusMinusCourt(undefined, everyone)).toEqual([]);
  });

  it('knows whether anyone was ever put on the court', () => {
    let doc = fresh();
    expect(courtUsed(doc.live)).toBe(false);
    expect(courtUsed(undefined)).toBe(false);
    doc = apply(doc, courtToggle(doc.live, 'a', 0));
    expect(courtUsed(doc.live)).toBe(true);
    doc = apply(doc, courtToggle(doc.live, 'a', 0)); // and back to the bench
    expect(courtUsed(doc.live)).toBe(true);
  });
});
