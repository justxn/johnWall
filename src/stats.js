// Pure stat helpers. A null stat means "not tracked" and is never treated as 0.

export const STAT_KEYS = ['points', 'rebounds', 'assists', 'steals', 'blocks'];
export const STAT_LABELS = { points: 'PTS', rebounds: 'REB', assists: 'AST', steals: 'STL', blocks: 'BLK' };
export const AVG_LABELS = { points: 'PPG', rebounds: 'RPG', assists: 'APG', steals: 'SPG', blocks: 'BPG' };

export const resultOf = (game) => (game.teamScore > game.opponentScore ? 'W' : 'L');

export const byDateDesc = (a, b) => (b.date || '').localeCompare(a.date || '');

export function record(games) {
  const wins = games.filter((g) => resultOf(g) === 'W').length;
  return { wins, losses: games.length - wins };
}

// Current streak, newest game first, e.g. { type: 'W', count: 3 }.
export function streak(games) {
  const sorted = [...games].sort(byDateDesc);
  if (!sorted.length) return null;
  const type = resultOf(sorted[0]);
  let count = 0;
  for (const g of sorted) {
    if (resultOf(g) !== type) break;
    count++;
  }
  return { type, count };
}

// Per-player season line. `tracked[k]` is how many games actually had stat k,
// so averages divide by that, not by games played.
export function playerLine(playerId, stats) {
  const rows = stats.filter((s) => s.playerId === playerId);
  const line = { gp: rows.length, total: {}, tracked: {}, avg: {} };
  for (const k of STAT_KEYS) {
    const vals = rows.map((r) => r[k]).filter((v) => v != null);
    line.tracked[k] = vals.length;
    line.total[k] = vals.reduce((a, b) => a + b, 0);
    line.avg[k] = vals.length ? line.total[k] / vals.length : null;
  }
  return line;
}

export const fmtAvg = (v) => (v == null ? '—' : v.toFixed(1));
export const fmtStat = (v) => (v == null ? '—' : String(v));
