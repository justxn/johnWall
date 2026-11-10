import { describe, expect, it } from 'vitest';
import {
  START_COINS,
  autoLine,
  autoLines,
  betProblem,
  bettingOpen,
  coinsOf,
  fmtCoins,
  fmtNet,
  grade,
  ledger,
  liveStatus,
  pickLabel,
  syncLines,
  target,
  winsWith,
} from '../src/book.js';

const s = (gameId, playerId, stats) => ({ gameId, playerId, ...stats });

describe('automatic lines', () => {
  it('sits half a point above the average rounded down', () => {
    expect(autoLine('p1', 'points', [s('g1', 'p1', { points: 7 }), s('g2', 'p1', { points: 8 })])).toBe(7.5); // avg 7.5
    expect(autoLine('p1', 'points', [s('g1', 'p1', { points: 6 }), s('g2', 'p1', { points: 8 })])).toBe(7.5); // avg 7.0
    expect(autoLine('p1', 'points', [s('g1', 'p1', { points: 6 }), s('g2', 'p1', { points: 7 }), s('g3', 'p1', { points: 7 })])).toBe(6.5); // avg 6.67
    expect(autoLine('p1', 'plusMinus', [s('g1', 'p1', { plusMinus: -3 }), s('g2', 'p1', { plusMinus: 1 })])).toBe(-0.5); // avg -1
  });

  it('needs two games with the stat tracked', () => {
    expect(autoLine('p1', 'points', [s('g1', 'p1', { points: 9 })])).toBeNull();
    expect(autoLine('p1', 'fg3m', [s('g1', 'p1', { fg3m: 2 }), s('g2', 'p1', { fg3m: null })])).toBeNull();
  });

  it('skips inactive players and anyone listed as out', () => {
    const players = [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B', active: false }, { id: 'p3', name: 'C' }];
    const stats = ['p1', 'p2', 'p3'].flatMap((p) => [s('g1', p, { points: 4 }), s('g2', p, { points: 6 })]);
    const lines = autoLines(players, stats, new Set(['p3']));
    expect(lines).toEqual([{ id: 'p1_points', playerId: 'p1', stat: 'points', line: 5.5 }]);
  });
});

describe('keeping posted lines up to date', () => {
  const wanted = [
    { id: 'p1_points', playerId: 'p1', stat: 'points', line: 8.5 },
    { id: 'p1_rebounds', playerId: 'p1', stat: 'rebounds', line: 3.5 },
    { id: 'p2_points', playerId: 'p2', stat: 'points', line: 4.5 },
  ];

  it('posts new props and moves automatic lines, but not ones set by hand', () => {
    const posted = [
      { id: 'p1_points', line: 7.5, auto: true },
      { id: 'p1_rebounds', line: 5, auto: false },
      { id: 'p2_assists', line: 1.5, auto: true }, // p2 no longer has enough assists history
      { id: 'p3_points', line: 2.5, auto: false, pulled: true },
    ];
    const { set, remove } = syncLines(posted, wanted);
    expect(set.map((l) => [l.id, l.line])).toEqual([['p1_points', 8.5], ['p2_points', 4.5]]);
    expect(remove).toEqual(['p2_assists']);
  });

  it('has nothing to do once lines match', () => {
    const posted = wanted.map((w) => ({ ...w, auto: true }));
    expect(syncLines(posted, wanted)).toEqual({ set: [], remove: [] });
  });
});

describe('betting window', () => {
  const game = { status: 'scheduled', date: '2026-11-11', time: '18:30' };
  it('closes at the start time, or when the game starts or ends', () => {
    expect(bettingOpen(game, new Date(2026, 10, 11, 18, 29))).toBe(true);
    expect(bettingOpen(game, new Date(2026, 10, 11, 18, 30))).toBe(false);
    expect(bettingOpen({ ...game, status: 'live' }, new Date(2026, 10, 1))).toBe(false);
    expect(bettingOpen({ ...game, status: 'final' }, new Date(2026, 10, 1))).toBe(false);
    expect(bettingOpen({ date: '2026-11-11' }, new Date(2026, 10, 1))).toBe(false); // no status = an old result
  });
  it('keeps a game without a time open until the end of its day', () => {
    expect(bettingOpen({ status: 'scheduled', date: '2026-11-11' }, new Date(2026, 10, 11, 21, 0))).toBe(true);
  });
});

describe('grading', () => {
  const bet = { stat: 'points', side: 'over', line: 7.5 };
  it('pays the side that beat the line', () => {
    expect(grade(bet, { points: 8 })).toBe('won');
    expect(grade(bet, { points: 7 })).toBe('lost');
    expect(grade({ ...bet, side: 'under' }, { points: 7 })).toBe('won');
  });
  it('pushes on a whole-number line, and voids when there is nothing to grade', () => {
    expect(grade({ ...bet, line: 8 }, { points: 8 })).toBe('push');
    expect(grade(bet, undefined)).toBe('void'); // didn't play
    expect(grade(bet, { points: null })).toBe('void'); // not tracked
  });
  it('grades plus-minus through zero', () => {
    expect(grade({ stat: 'plusMinus', side: 'under', line: -0.5 }, { plusMinus: -2 })).toBe('won');
  });
});

describe('coins', () => {
  const games = [
    { id: 'g1', status: 'final' },
    { id: 'g2', status: 'final' },
    { id: 'g3', status: 'scheduled' },
  ];
  const stats = [s('g1', 'p1', { points: 9 }), s('g2', 'p1', { points: 4 })];
  const bet = (id, gameId, bettorId, side, stake, extra = {}) => ({ id, gameId, bettorId, bettorName: bettorId, playerId: 'p1', stat: 'points', side, line: 6.5, stake, ...extra });

  it('settles finished games at even money and holds stakes on open ones', () => {
    const book = ledger([
      bet('b1', 'g1', 'sam', 'over', 100), // 9 > 6.5: +100
      bet('b2', 'g2', 'sam', 'over', 50), // 4 < 6.5: -50
      bet('b3', 'g3', 'sam', 'under', 30), // not played yet: held
      bet('b4', 'g1', 'p2', 'under', 200), // -200
      bet('b5', 'gone', 'p2', 'over', 250), // deleted game: ignored
    ], games, stats);
    expect(book.sam).toMatchObject({ coins: START_COINS + 50, held: 30, available: START_COINS + 20, won: 1, lost: 1, open: 1 });
    expect(book.p2).toMatchObject({ coins: START_COINS - 200, won: 0, lost: 1, open: 0 });
  });

  it('gives the stake back on a void', () => {
    const book = ledger([bet('b1', 'g1', 'sam', 'over', 100, { playerId: 'p9' })], games, stats);
    expect(book.sam).toMatchObject({ coins: START_COINS, pushed: 1 });
  });

  it('uses the name from the latest bet, and starts newcomers at the full amount', () => {
    const book = ledger([
      bet('b1', 'g3', 'u1', 'over', 10, { bettorName: 'Sammy', placedAt: 2 }),
      bet('b2', 'g3', 'u1', 'over', 10, { bettorName: 'Sam', placedAt: 1 }),
    ], games, stats);
    expect(book.u1.name).toBe('Sammy');
    expect(coinsOf(book, 'nobody')).toMatchObject({ coins: START_COINS, available: START_COINS });
  });
});

describe('placing a bet', () => {
  it('checks the stake and keeps people off their own under', () => {
    const ok = { stake: 100, side: 'over', playerId: 'p1' };
    expect(betProblem(ok, { available: 1000, myPlayerId: 'p1' })).toBeNull();
    expect(betProblem({ ...ok, stake: 0 }, { available: 1000 })).toMatch(/how many coins/);
    expect(betProblem({ ...ok, stake: 2.5 }, { available: 1000 })).toMatch(/how many coins/);
    expect(betProblem({ ...ok, stake: 300 }, { available: 1000 })).toMatch(/most you can bet is 250/);
    expect(betProblem(ok, { available: 60 })).toMatch(/You have 60 coins/);
    expect(betProblem({ ...ok, side: 'under' }, { available: 1000, myPlayerId: 'p1' })).toMatch(/under on yourself/);
    expect(betProblem({ ...ok, side: 'under' }, { available: 1000, myPlayerId: 'p2' })).toBeNull();
  });

  it('spells out what wins', () => {
    expect(winsWith({ stat: 'points', side: 'over', line: 7.5 })).toBe('8 or more points');
    expect(winsWith({ stat: 'points', side: 'under', line: 7.5 })).toBe('7 or fewer points');
    expect(winsWith({ stat: 'fg3m', side: 'over', line: 2 })).toBe('3 or more threes'); // 2 is a push
    expect(winsWith({ stat: 'plusMinus', side: 'over', line: 2.5 })).toBe('+3 or better');
    expect(winsWith({ stat: 'plusMinus', side: 'under', line: -0.5 })).toBe('-1 or worse');
    expect(pickLabel({ stat: 'plusMinus', side: 'over', line: 2.5 })).toBe('Over +2.5 +/-');
    expect(pickLabel({ stat: 'fg3m', side: 'under', line: 1.5 })).toBe('Under 1.5 3PM');
  });
});

describe('live bets and display', () => {
  it('knows the number each side needs', () => {
    expect(target({ side: 'over', line: 7.5 })).toBe(8);
    expect(target({ side: 'under', line: 7.5 })).toBe(7);
    expect(target({ side: 'over', line: 8 })).toBe(9); // 8 itself is a push
    expect(target({ side: 'under', line: 8 })).toBe(7);
    expect(target({ side: 'over', line: -0.5 })).toBe(0);
    expect(target({ side: 'under', line: -0.5 })).toBe(-1);
  });

  it('tracks a bet against the stat so far', () => {
    const over = { stat: 'points', side: 'over', line: 7.5 };
    expect(liveStatus(over, { points: 5 })).toEqual({ value: 5, need: 8, winning: false });
    expect(liveStatus(over, { points: 8 })).toMatchObject({ winning: true });
    expect(liveStatus({ ...over, side: 'under' }, { points: 7 })).toMatchObject({ need: 7, winning: true });
    expect(liveStatus({ ...over, side: 'under' }, { points: 8 })).toMatchObject({ winning: false });
    expect(liveStatus(over, { points: null })).toBeNull(); // not tracked
    expect(liveStatus(over, undefined)).toBeNull(); // not in the box score
  });

  it('formats coins, and ups and downs with their sign', () => {
    expect(fmtCoins(1250)).toBe((1250).toLocaleString());
    expect(fmtNet(150)).toBe('+150');
    expect(fmtNet(-50)).toBe('−50');
    expect(fmtNet(0)).toBe('0');
  });
});
