// Pure stat helpers. A null (or missing) stat means "not tracked" and is never
// treated as 0.
import { normName } from './util.js';

export const STAT_KEYS = ['points', 'rebounds', 'assists', 'steals', 'blocks', 'minutes'];
export const STAT_LABELS = { points: 'PTS', rebounds: 'REB', assists: 'AST', steals: 'STL', blocks: 'BLK', minutes: 'MIN' };
export const AVG_LABELS = { points: 'PPG', rebounds: 'RPG', assists: 'APG', steals: 'SPG', blocks: 'BPG', minutes: 'MPG' };
export const STAT_NAMES = { points: 'Points', rebounds: 'Rebounds', assists: 'Assists', steals: 'Steals', blocks: 'Blocks', minutes: 'Minutes' };

// Games saved before scheduling existed have no status; they're all results.
export const statusOf = (game) => game.status || 'final';
export const isFinal = (game) => statusOf(game) === 'final';
export const resultOf = (game) => (game.teamScore > game.opponentScore ? 'W' : 'L');

// Oldest first. Same-day games go by start time, then by when they were entered,
// so doubleheaders keep a stable order.
export function byDateAsc(a, b) {
  return (
    (a.date || '').localeCompare(b.date || '') ||
    (a.time || '').localeCompare(b.time || '') ||
    (a.createdAt ?? 0) - (b.createdAt ?? 0) ||
    a.id.localeCompare(b.id)
  );
}
export const byDateDesc = (a, b) => byDateAsc(b, a);

// Finished games, newest first.
export const finals = (games) => games.filter(isFinal).sort(byDateDesc);
export const liveGames = (games) => games.filter((g) => statusOf(g) === 'live');

// Scheduled games from today on, soonest first.
export const upcoming = (games, today) =>
  games.filter((g) => statusOf(g) === 'scheduled' && (g.date || '') >= today).sort(byDateAsc);

// Scheduled games whose date has passed without a result being entered.
export const needsResult = (games, today) =>
  games.filter((g) => statusOf(g) === 'scheduled' && (g.date || '') < today).sort(byDateDesc);

export function record(games) {
  const done = games.filter(isFinal);
  const wins = done.filter((g) => resultOf(g) === 'W').length;
  return { wins, losses: done.length - wins };
}

// Current streak, newest game first, e.g. { type: 'W', count: 3 }.
export function streak(games) {
  const sorted = finals(games);
  if (!sorted.length) return null;
  const type = resultOf(sorted[0]);
  let count = 0;
  for (const g of sorted) {
    if (resultOf(g) !== type) break;
    count++;
  }
  return { type, count };
}

// Points for and against per game, and the average margin.
export function teamAverages(games) {
  const done = games.filter(isFinal);
  if (!done.length) return null;
  const pf = done.reduce((n, g) => n + g.teamScore, 0);
  const pa = done.reduce((n, g) => n + g.opponentScore, 0);
  return { ppg: pf / done.length, oppg: pa / done.length, diff: (pf - pa) / done.length };
}

// Only finished games count toward season numbers (not one still being played).
export function finalStats(games, stats) {
  const done = new Set(games.filter(isFinal).map((g) => g.id));
  return stats.filter((s) => done.has(s.gameId));
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

// Ranking for one stat, best first. Players need at least one tracked game.
export function leaders(players, stats, key, { totals = false } = {}) {
  return players
    .map((player) => ({ player, line: playerLine(player.id, stats) }))
    .filter(({ line }) => line.tracked[key] > 0)
    .map((row) => ({ ...row, value: totals ? row.line.total[key] : row.line.avg[key] }))
    .sort((a, b) => b.value - a.value || a.player.name.localeCompare(b.player.name));
}

// Single-game bests: { points: { value, gameId } | null, ... }. Ties keep the
// earlier game.
export function careerHighs(playerId, stats, games) {
  const order = new Map([...games].sort(byDateAsc).map((g, i) => [g.id, i]));
  const rows = stats
    .filter((s) => s.playerId === playerId && order.has(s.gameId))
    .sort((a, b) => order.get(a.gameId) - order.get(b.gameId));
  const out = {};
  for (const k of STAT_KEYS) {
    out[k] = null;
    for (const r of rows) {
      if (r[k] != null && (out[k] == null || r[k] > out[k].value)) out[k] = { value: r[k], gameId: r.gameId };
    }
  }
  return out;
}

// Every finished game a player has a line in, newest first.
export function gameLog(playerId, stats, games) {
  const byId = new Map(games.filter(isFinal).map((g) => [g.id, g]));
  return stats
    .filter((s) => s.playerId === playerId && byId.has(s.gameId))
    .map((line) => ({ game: byId.get(line.gameId), line }))
    .sort((a, b) => byDateDesc(a.game, b.game));
}

// Results against one opponent. Names are free text, so they're compared loosely.
export function headToHead(games, opponent) {
  const key = normName(opponent);
  const past = finals(games).filter((g) => normName(g.opponent) === key);
  return { ...record(past), games: past };
}

// Player points vs the team score. Returns { sum, teamScore } when they don't
// match, or null when they do (or when some points weren't tracked).
export function pointsCheck(teamScore, lines) {
  if (teamScore == null || !lines.length || lines.some((l) => l.points == null)) return null;
  const sum = lines.reduce((n, l) => n + l.points, 0);
  return sum === teamScore ? null : { sum, teamScore };
}

export const fmtAvg = (v) => (v == null ? '—' : v.toFixed(1));
export const fmtStat = (v) => (v == null ? '—' : String(v));
