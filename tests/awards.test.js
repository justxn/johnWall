import { describe, expect, it } from 'vitest';
import { awardWins, latestWinners, playerAwards, tally, voteId, winners } from '../src/awards.js';

const vote = (gameId, categoryId, voterId, nomineeId) => ({ gameId, categoryId, voterId, nomineeId });

const games = [
  { id: 'g1', date: '2026-10-20', teamScore: 21, opponentScore: 12 },
  { id: 'g2', date: '2026-10-27', teamScore: 21, opponentScore: 18 },
  { id: 'g3', date: '2026-11-04', status: 'scheduled' },
];
const categories = [{ id: 'mvp', name: 'MVP' }, { id: 'hustle', name: 'Best Hustle' }];
const votes = [
  vote('g1', 'mvp', 'p1', 'p3'),
  vote('g1', 'mvp', 'p2', 'p3'),
  vote('g2', 'mvp', 'p1', 'p2'),
  vote('g2', 'mvp', 'p3', 'p1'),
  vote('g2', 'hustle', 'p1', 'p4'),
];

describe('tally and winners', () => {
  it('counts votes per nominee and returns everyone tied for first', () => {
    expect(tally(votes, 'g2', 'mvp')).toEqual({ p2: 1, p1: 1 });
    expect(winners(tally(votes, 'g2', 'mvp')).sort()).toEqual(['p1', 'p2']);
    expect(winners({})).toEqual([]);
  });

  it('builds one doc id per voter per award', () => {
    expect(voteId('p1', 'mvp')).toBe('p1_mvp');
  });
});

describe('award totals', () => {
  it('credits every tied winner', () => {
    const wins = awardWins(games, categories, votes);
    expect(wins.mvp).toEqual({ p3: 1, p2: 1, p1: 1 });
    expect(wins.hustle).toEqual({ p4: 1 });
  });

  it('lists one player\'s awards, biggest first', () => {
    const more = [...votes, vote('g1', 'hustle', 'p2', 'p4')];
    expect(playerAwards('p4', games, categories, more).map((a) => [a.category.id, a.count])).toEqual([['hustle', 2]]);
    expect(playerAwards('p9', games, categories, votes)).toEqual([]);
  });

  it('finds the latest game with a winner', () => {
    expect(latestWinners(games, votes, 'mvp').game.id).toBe('g2');
    expect(latestWinners(games, votes.slice(0, 2), 'mvp')).toEqual({ game: games[0], winners: ['p3'] });
    expect(latestWinners(games, [], 'mvp')).toBeNull();
  });
});
