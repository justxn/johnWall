import { describe, expect, it } from 'vitest';
import { KINDS, MAX_COMMENT, SECTIONS, anonName, buildFeed, cleanComment, commentsFor, fill, hash, tickerItems } from '../src/news.js';

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

  it('keeps story ids stable, so comments stay with their story', () => {
    const ids = buildFeed(base, 0).map((i) => i.id);
    for (const id of ['recap:g3', 'high:g3:p1', 'tov:g3:p2', 'brick:g3:p1', 'award:g3:mvp:p1', 'injury:i1']) expect(ids).toContain(id);
  });

  it('gives every story what the page needs', () => {
    const sections = new Set(SECTIONS.map((s) => s.id));
    for (const item of buildFeed(base, 0)) {
      expect(item.kicker).toBeTruthy();
      expect(item.tone).toMatch(/^(accent|win|loss|gold|warn|book)$/);
      expect(sections.has(KINDS[item.kind].section)).toBe(true);
      expect(item.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('dates a late game by its own day', () => {
    const late = { ...base, games: [game('g1', '2026-11-04', 40, 30, { time: '23:45' })], stats: [], votes: [], injuries: [] };
    expect(buildFeed(late, 0)[0]).toMatchObject({ kind: 'recap', date: '2026-11-04' });
  });
});

describe('more stories', () => {
  const season = {
    teamName: 'John Wall',
    players,
    games: [
      game('g1', '2026-11-04', 21, 15),
      game('g2', '2026-11-11', 21, 18),
      game('g3', '2026-11-18', 21, 6),
      { id: 'g4', date: '2026-11-25', time: '18:30', opponent: 'Next Up', status: 'scheduled' },
    ],
    stats: [
      stat('g1', 'p1', { points: 9, rebounds: 2 }),
      stat('g2', 'p1', { points: 9, rebounds: 3 }),
      stat('g3', 'p1', { points: 10, rebounds: 10, assists: 1 }),
      stat('g1', 'p2', { points: 4, assists: 2 }),
      stat('g2', 'p2', { points: 4, assists: 6 }),
      stat('g3', 'p2', { points: 3, steals: 3, blocks: 2, assists: 2 }),
    ],
    votes: [],
    categories: [],
    injuries: [{ id: 'i2', playerId: 'p3', status: 'out', note: 'ankle', since: '2026-11-05', clearedOn: '2026-11-12' }],
    bets: [
      { id: 'b1', gameId: 'g3', bettorId: 'p3', bettorName: 'Walter', playerId: 'p1', stat: 'points', side: 'over', line: 8.5, stake: 100 },
      { id: 'b2', gameId: 'g3', bettorId: 'fan1', bettorName: 'Amy', playerId: 'p2', stat: 'points', side: 'over', line: 4.5, stake: 50 },
    ],
    lines: [
      { id: 'p1_points', gameId: 'g4', playerId: 'p1', stat: 'points', line: 9.5 },
      { id: 'p2_points', gameId: 'g4', playerId: 'p2', stat: 'points', line: 3.5 },
    ],
  };
  const gameWeek = new Date(2026, 10, 24).getTime();

  it('covers badges, milestones, all-round nights, the book and players coming back', () => {
    const byId = Object.fromEntries(buildFeed(season, 0).map((i) => [i.id, i]));
    expect(byId['standout:g3:p1']).toMatchObject({ kind: 'standout', art: { value: 'DD' } }); // 10 and 10
    expect(byId['milestone:g3:p1']).toMatchObject({ kind: 'milestone', art: { value: 25 } }); // 18 -> 28
    // Steals were only kept in g3, so Kotaro's 3 average out to Hall of Fame,
    // the best tier anyone reached; the rest are listed, best first.
    expect(byId['badge:g3']).toMatchObject({ kind: 'badge', playerId: 'p2', art: { tier: 3 } });
    expect(byId['badge:g3'].headline).toContain('Hall of Fame Pick Pocket');
    expect(byId['badge:g3'].body).toBe('Also leveling up: Kotaro (Gold Rim Protector), Clyde (Silver Glass Cleaner), Clyde (Bronze Iron Man) and 1 more.');
    expect(byId['book:g3'].headline).toContain('Walter');
    expect(byId['book:g3'].body).toBe('2 bets settled. The house paid out 50 coins.');
    expect(byId['cleared:i2']).toMatchObject({ kind: 'injury', kicker: 'Back in action' });
  });

  it('gives a defensive night to someone other than the top scorer', () => {
    const d = { ...season, stats: [stat('g3', 'p1', { points: 12 }), stat('g3', 'p2', { points: 3, steals: 3, blocks: 2 })], bets: [], injuries: [] };
    const item = buildFeed(d, 0).find((i) => i.kind === 'standout');
    expect(item).toMatchObject({ playerId: 'p2', art: { value: 5, label: 'STL+BLK' } });
  });

  it('previews the next game two days out, with its featured line', () => {
    expect(buildFeed(season, new Date(2026, 10, 22).getTime()).map((i) => i.kind)).not.toContain('preview');
    const feed = buildFeed(season, gameWeek);
    expect(feed[0]).toMatchObject({ kind: 'preview', id: 'next:g4', date: '2026-11-23' });
    expect(feed[1]).toMatchObject({ kind: 'lines', playerId: 'p1' });
    expect(feed[1].headline).toContain('9.5');
  });

  it('fills every slot and comments on every story', () => {
    for (const item of buildFeed(season, gameWeek)) {
      for (const text of [item.headline, item.body, ...item.sim.map((c) => c.text)]) expect(text).not.toMatch(/[{}]|undefined|NaN/);
      expect(item.sim.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('sums up the season for the ticker', () => {
    const ticks = Object.fromEntries(tickerItems(season, gameWeek).map((t) => [t.label, t.text]));
    expect(ticks.Final).toBe('John Wall 21, Rival 6');
    expect(ticks.Next).toMatch(/^vs Next Up, /);
    expect(ticks.Record).toBe('3–0, W3');
    expect(ticks.PPG).toBe('Clyde 9.3');
    expect(ticks.Injury).toBeUndefined(); // Walter is back
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
