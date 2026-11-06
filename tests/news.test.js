import { describe, expect, it } from 'vitest';
import { MAX_COMMENT, anonName, buildFeed, cleanComment, commentsFor, fill, hash } from '../src/news.js';

const players = [
  { id: 'p1', name: 'Clyde' },
  { id: 'p2', name: 'Kotaro' },
  { id: 'p3', name: 'Walter' },
];
const game = (id, date, us, them, extra = {}) => ({ id, date, opponent: 'Rival', status: 'final', teamScore: us, opponentScore: them, ...extra });
const stat = (gameId, playerId, s) => ({ gameId, playerId, ...s });

const base = {
  teamName: 'John Wall',
  players,
  games: [game('g1', '2026-11-04', 40, 30), game('g2', '2026-11-11', 50, 30), game('g3', '2026-11-18', 20, 45)],
  stats: [
    stat('g1', 'p1', { points: 8, turnovers: 0 }),
    stat('g2', 'p1', { points: 10, turnovers: 1 }),
    stat('g3', 'p1', { points: 22, turnovers: 4, fgm: 2, fga: 12 }),
    stat('g3', 'p2', { points: 3, turnovers: 5 }),
  ],
  votes: [{ gameId: 'g3', categoryId: 'mvp', voterId: 'x', nomineeId: 'p1' }],
  categories: [{ id: 'mvp', name: 'MVP' }],
  injuries: [{ id: 'i1', playerId: 'p3', status: 'out', note: 'rolled ankle', since: '2026-11-19' }],
};

describe('feed', () => {
  it('is the same every time for the same data', () => {
    expect(buildFeed(base, 0)).toEqual(buildFeed(structuredClone(base), 0));
  });

  it('comes newest first', () => {
    const ts = buildFeed(base, 0).map((i) => i.ts);
    expect(ts).toEqual([...ts].sort((a, b) => b - a));
  });

  it('reports each kind of event', () => {
    const kinds = new Set(buildFeed(base, 0).map((i) => i.kind));
    for (const k of ['recap', 'high', 'shame', 'award', 'injury']) expect(kinds.has(k)).toBe(true);
  });

  it('spots a career high only after a few games', () => {
    expect(buildFeed(base, 0).find((i) => i.kind === 'high')).toMatchObject({ playerId: 'p1' });
  });

  it('never leaves a template slot unfilled', () => {
    for (const item of buildFeed(base, 0)) {
      for (const text of [item.headline, item.body, ...item.sim.map((c) => c.text)]) expect(text).not.toMatch(/[{}]|undefined|NaN/);
    }
  });

  it('gives each story 2 to 4 simulated comments from different people', () => {
    for (const item of buildFeed(base, 0).filter((i) => i.kind !== 'welcome')) {
      expect(item.sim.length).toBeGreaterThanOrEqual(2);
      expect(item.sim.length).toBeLessThanOrEqual(4);
      expect(new Set(item.sim.map((c) => c.author)).size).toBe(item.sim.length);
    }
  });

  it('has a welcome story when nothing has happened', () => {
    expect(buildFeed({ players: [] }, 5)).toMatchObject([{ kind: 'welcome', ts: 5 }]);
  });

  it('skips games without a score', () => {
    const feed = buildFeed({ ...base, games: [game('g9', '2026-12-01', null, null)], stats: [], votes: [], injuries: [] }, 0);
    expect(feed.map((i) => i.kind)).toEqual(['welcome']);
  });
});

describe('comments', () => {
  it('trims and limits what people post', () => {
    expect(cleanComment('  hi   there ')).toEqual({ text: 'hi there' });
    expect(cleanComment('   ')).toHaveProperty('error');
    expect(cleanComment('x'.repeat(MAX_COMMENT + 1))).toHaveProperty('error');
  });

  it('collects the real comments for one story, oldest first', () => {
    const all = [
      { id: 'a', itemId: 's1', createdAt: 20 },
      { id: 'b', itemId: 's2', createdAt: 5 },
      { id: 'c', itemId: 's1', createdAt: 10 },
    ];
    expect(commentsFor(all, 's1').map((c) => c.id)).toEqual(['c', 'a']);
  });

  it('names anonymous fans the same way every time', () => {
    expect(anonName('abc')).toBe(anonName('abc'));
    expect(anonName('abc')).toMatch(/^Fan \d+$/);
  });

  it('fills slots and hashes consistently', () => {
    expect(fill('{a} and {b}', { a: 1, b: 'x' })).toBe('1 and x');
    expect(hash('x')).toBe(hash('x'));
  });
});
