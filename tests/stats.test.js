import { describe, expect, it } from 'vitest';
import {
  byDateDesc,
  careerHighs,
  finalStats,
  gameLog,
  headToHead,
  leaders,
  needsResult,
  playerLine,
  pointsCheck,
  record,
  streak,
  teamAverages,
  upcoming,
} from '../src/stats.js';

const game = (id, date, teamScore, opponentScore, extra = {}) => ({ id, date, opponent: 'Air Ballers', teamScore, opponentScore, ...extra });

describe('record and streak', () => {
  it('counts only finished games', () => {
    const games = [
      game('a', '2026-10-01', 21, 10),
      game('b', '2026-10-08', 15, 21),
      game('c', '2026-11-04', null, null, { status: 'scheduled' }),
      game('d', '2026-10-15', 5, 3, { status: 'live' }),
    ];
    expect(record(games)).toEqual({ wins: 1, losses: 1 });
  });

  it('treats games without a status as results (saved before scheduling existed)', () => {
    expect(record([game('a', '2026-10-01', 21, 10)])).toEqual({ wins: 1, losses: 0 });
  });

  it('orders same-day games by time, so a doubleheader gives the right streak', () => {
    const games = [
      game('zzz', '2026-10-27', 21, 18, { time: '18:30' }), // won the first game
      game('aaa', '2026-10-27', 15, 21, { time: '19:30' }), // lost the second
      game('old', '2026-10-20', 21, 12, { time: '18:30' }),
    ];
    expect(streak(games)).toEqual({ type: 'L', count: 1 });
  });

  it('falls back to entry order for same-day games without times', () => {
    const games = [
      game('zzz', '2026-10-27', 15, 21, { createdAt: 2000 }), // entered second = played second
      game('aaa', '2026-10-27', 21, 18, { createdAt: 1000 }),
    ];
    expect([...games].sort(byDateDesc).map((g) => g.id)).toEqual(['zzz', 'aaa']);
    expect(streak(games)).toEqual({ type: 'L', count: 1 });
  });

  it('returns null with no results', () => {
    expect(streak([game('c', '2026-11-04', null, null, { status: 'scheduled' })])).toBeNull();
  });
});

describe('teamAverages', () => {
  it('averages points for, against and the margin', () => {
    expect(teamAverages([game('a', '2026-10-01', 21, 10), game('b', '2026-10-08', 15, 21)])).toEqual({ ppg: 18, oppg: 15.5, diff: 2.5 });
    expect(teamAverages([])).toBeNull();
  });
});

describe('schedule helpers', () => {
  const games = [
    game('past', '2026-10-28', null, null, { status: 'scheduled' }),
    game('later', '2026-11-11', null, null, { status: 'scheduled', time: '18:30' }),
    game('next', '2026-11-04', null, null, { status: 'scheduled', time: '18:30' }),
    game('today', '2026-10-29', null, null, { status: 'scheduled' }),
    game('done', '2026-10-21', 21, 19),
  ];
  it('lists upcoming games soonest first, including today', () => {
    expect(upcoming(games, '2026-10-29').map((g) => g.id)).toEqual(['today', 'next', 'later']);
  });
  it('flags past scheduled games that still need a score', () => {
    expect(needsResult(games, '2026-10-29').map((g) => g.id)).toEqual(['past']);
  });
});

describe('player stats', () => {
  const games = [game('g1', '2026-10-01', 21, 10), game('g2', '2026-10-08', 15, 21), game('g3', '2026-10-15', 3, 2, { status: 'live' })];
  const stats = [
    { gameId: 'g1', playerId: 'p1', points: 10, rebounds: 4, assists: null, steals: null, blocks: null },
    { gameId: 'g2', playerId: 'p1', points: 6, rebounds: null, assists: 2, steals: 1, blocks: 0, minutes: 18 },
    { gameId: 'g1', playerId: 'p2', points: 11, rebounds: 2 },
    { gameId: 'g3', playerId: 'p1', points: 30 }, // live game: not counted yet
  ];

  it('averages each stat over the games it was tracked, treating missing minutes as untracked', () => {
    const line = playerLine('p1', finalStats(games, stats));
    expect(line.gp).toBe(2);
    expect(line.avg.points).toBe(8);
    expect(line.avg.rebounds).toBe(4);
    expect(line.tracked.rebounds).toBe(1);
    expect(line.avg.minutes).toBe(18);
    expect(line.tracked.minutes).toBe(1);
  });

  it('ranks leaders and skips players who never had the stat tracked', () => {
    const players = [{ id: 'p1', name: 'Marcus' }, { id: 'p2', name: 'Devon' }, { id: 'p3', name: 'Tyler' }];
    const done = finalStats(games, stats);
    expect(leaders(players, done, 'points').map((r) => [r.player.id, r.value])).toEqual([['p2', 11], ['p1', 8]]);
    expect(leaders(players, done, 'points', { totals: true }).map((r) => r.value)).toEqual([16, 11]);
    expect(leaders(players, done, 'minutes').map((r) => r.player.id)).toEqual(['p1']);
  });

  it('finds single-game highs, keeping the earlier game on ties', () => {
    const highs = careerHighs('p1', [...stats, { gameId: 'g2', playerId: 'p9', points: 50 }], games.slice(0, 2));
    expect(highs.points).toEqual({ value: 10, gameId: 'g1' });
    expect(highs.assists).toEqual({ value: 2, gameId: 'g2' });
    expect(highs.blocks).toEqual({ value: 0, gameId: 'g2' });

    const tied = careerHighs('p1', [
      { gameId: 'g2', playerId: 'p1', points: 10 },
      { gameId: 'g1', playerId: 'p1', points: 10 },
    ], games.slice(0, 2));
    expect(tied.points.gameId).toBe('g1');
  });

  it('builds a newest-first game log of finished games', () => {
    expect(gameLog('p1', stats, games).map((r) => r.game.id)).toEqual(['g2', 'g1']);
  });
});

describe('headToHead', () => {
  it('matches opponent names loosely', () => {
    const games = [
      game('a', '2026-10-01', 21, 10, { opponent: 'Air Ballers' }),
      game('b', '2026-10-08', 15, 21, { opponent: '  air   ballers ' }),
      game('c', '2026-10-09', 21, 2, { opponent: 'Brick Squad' }),
      game('d', '2026-11-04', null, null, { opponent: 'Air Ballers', status: 'scheduled' }),
    ];
    const h2h = headToHead(games, 'AIR BALLERS');
    expect([h2h.wins, h2h.losses]).toEqual([1, 1]);
    expect(h2h.games.map((g) => g.id)).toEqual(['b', 'a']);
  });
});

describe('pointsCheck', () => {
  it('flags when player points do not add up to the team score', () => {
    expect(pointsCheck(21, [{ points: 10 }, { points: 9 }])).toEqual({ sum: 19, teamScore: 21 });
    expect(pointsCheck(21, [{ points: 10 }, { points: 11 }])).toBeNull();
  });
  it('stays quiet when points were not tracked for everyone', () => {
    expect(pointsCheck(21, [{ points: 10 }, { points: null }])).toBeNull();
    expect(pointsCheck(null, [{ points: 10 }])).toBeNull();
    expect(pointsCheck(21, [])).toBeNull();
  });
});
