// Vote tallies. Votes carry { gameId, categoryId, voterId, nomineeId }.

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
