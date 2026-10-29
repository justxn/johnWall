// Vote tallies. Votes carry { gameId, categoryId, voterId, nomineeId }.
import { finals, isFinal } from './stats.js';

// Doc id for a vote, so each voter has at most one vote per award per game.
export const voteId = (voterId, categoryId) => `${voterId}_${categoryId}`;

export function tally(votes, gameId, categoryId) {
  const counts = {};
  for (const v of votes) {
    if (v.gameId === gameId && v.categoryId === categoryId) {
      counts[v.nomineeId] = (counts[v.nomineeId] || 0) + 1;
    }
  }
  return counts;
}

// Everyone tied for the top count (empty when nobody voted).
export function winners(counts) {
  const max = Math.max(0, ...Object.values(counts));
  if (max === 0) return [];
  return Object.keys(counts).filter((id) => counts[id] === max);
}

// Awards won across all games: { [categoryId]: { [playerId]: wins } }.
export function awardWins(games, categories, votes) {
  const out = {};
  for (const c of categories) {
    out[c.id] = {};
    for (const g of games) {
      for (const id of winners(tally(votes, g.id, c.id))) {
        out[c.id][id] = (out[c.id][id] || 0) + 1;
      }
    }
  }
  return out;
}

// Awards one player has won, e.g. [{ category, count: 2 }], biggest first.
export function playerAwards(playerId, games, categories, votes) {
  const wins = awardWins(games.filter(isFinal), categories, votes);
  return categories
    .map((category) => ({ category, count: wins[category.id]?.[playerId] || 0 }))
    .filter((a) => a.count)
    .sort((a, b) => b.count - a.count);
}

// The most recent finished game where this award has a winner.
export function latestWinners(games, votes, categoryId) {
  for (const game of finals(games)) {
    const won = winners(tally(votes, game.id, categoryId));
    if (won.length) return { game, winners: won };
  }
  return null;
}
