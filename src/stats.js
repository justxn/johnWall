// Pure stat helpers. A null (or missing) stat means "not tracked" and is never
// treated as 0.
import { normName } from './util.js';

export const STAT_KEYS = ['points', 'rebounds', 'assists', 'steals', 'blocks', 'turnovers', 'minutes', 'plusMinus'];
export const STAT_LABELS = {
  points: 'PTS', rebounds: 'REB', assists: 'AST', steals: 'STL', blocks: 'BLK', turnovers: 'TO', minutes: 'MIN', plusMinus: '+/-',
};
export const AVG_LABELS = {
  points: 'PPG', rebounds: 'RPG', assists: 'APG', steals: 'SPG', blocks: 'BPG', turnovers: 'TOPG', minutes: 'MPG', plusMinus: '+/-',
};
export const STAT_NAMES = {
  points: 'Points', rebounds: 'Rebounds', assists: 'Assists', steals: 'Steals', blocks: 'Blocks', turnovers: 'Turnovers', minutes: 'Minutes', plusMinus: 'Plus-minus',
};

// These come from who's on the court during a live game, not from taps.
// Plus-minus is the score difference while a player is out there.
export const COURT_STATS = ['minutes', 'plusMinus'];

// Shooting is kept as makes and attempts on each stat line, blank when not
// tracked. FG is every shot from the floor (threes included), 3PT only shots
// from behind the arc. The league has no free throws, so there's no FT.
export const SHOOTING = [
  { key: 'fg', made: 'fgm', att: 'fga', label: 'FG', pct: 'FG%', name: 'Field goals' },
  { key: 'three', made: 'fg3m', att: 'fg3a', label: '3PT', pct: '3P%', name: 'Threes' },
];
export const SHOOTING_FIELDS = SHOOTING.flatMap((s) => [s.made, s.att]);
export const shootingOf = (key) => SHOOTING.find((s) => s.key === key) || null;

// How baskets count in our league (1s and 2s): 1 inside the arc, 2 behind
// it. Each shot also lists the shooting stats it counts toward.
export const SHOTS = {
  inside: { points: 1, made: ['fgm'], att: ['fga'] },
  three: { points: 2, made: ['fgm', 'fg3m'], att: ['fga', 'fg3a'] },
};

// The stat changes for one shot: its points if it went in, plus the makes and
// attempts when shooting is being tracked.
export function shotDeltas(shot, made, { shooting = true } = {}) {
  const { points, made: madeKeys, att } = SHOTS[shot];
  const out = made ? { points } : {};
  if (shooting) {
    for (const k of att) out[k] = 1;
    if (made) for (const k of madeKeys) out[k] = 1;
  }
  return out;
}

// Points the makes add up to, or null unless every kind of shot was tracked.
export function pointsFromMakes(line) {
  if (SHOOTING.some((s) => line[s.made] == null)) return null;
  return (line.fgm - line.fg3m) * SHOTS.inside.points + line.fg3m * SHOTS.three.points;
}

// What's wrong with typed-in shooting numbers, or null when they make sense.
export function shootingProblem(line) {
  for (const s of SHOOTING) {
    if ((line[s.made] == null) !== (line[s.att] == null)) return `fill in both ${s.label} made and attempted, or neither`;
    if (line[s.made] > line[s.att]) return `${s.label} made can't be more than attempted`;
  }
  if (line.fg3a != null && line.fga == null) return 'fill in FG too (threes count toward it)';
  if (line.fg3m > line.fgm || line.fg3a > line.fga) return 'threes count toward FG too, so 3PT can\'t be more than FG';
  return null;
}

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
  const line = { gp: rows.length, total: {}, tracked: {}, avg: {}, shots: {} };
  for (const k of STAT_KEYS) {
    const vals = rows.map((r) => r[k]).filter((v) => v != null);
    line.tracked[k] = vals.length;
    line.total[k] = vals.reduce((a, b) => a + b, 0);
    line.avg[k] = vals.length ? line.total[k] / vals.length : null;
  }
  // Shooting adds up makes and attempts, so a percentage is everything made
  // over everything tried, not an average of each game's percentage.
  for (const s of SHOOTING) {
    const games = rows.filter((r) => r[s.made] != null && r[s.att] != null);
    const made = games.reduce((n, r) => n + r[s.made], 0);
    const att = games.reduce((n, r) => n + r[s.att], 0);
    line.shots[s.key] = { made, att, games: games.length, pct: att ? made / att : null };
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

// Shooting percentage ranking ('fg' or 'three'). Players need at least
// one attempt; at the same percentage, more attempts ranks higher.
export function shootingLeaders(players, stats, key) {
  return players
    .map((player) => ({ player, line: playerLine(player.id, stats) }))
    .filter(({ line }) => line.shots[key].att > 0)
    .map((row) => ({ ...row, value: row.line.shots[key].pct }))
    .sort((a, b) => b.value - a.value || b.line.shots[key].att - a.line.shots[key].att || a.player.name.localeCompare(b.player.name));
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

// Reads a typed-in stat. Blank (or junk) means "not tracked". Plus-minus can be
// negative and may be typed with a sign ("+3", "-2", "−2"); everything else is
// a count, so it can't go below 0.
export function parseStat(raw, key) {
  const s = String(raw ?? '').trim().replace(/^[−–]/, '-');
  if (s === '') return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  if (key === 'plusMinus') return Math.trunc(n) || 0; // `|| 0` turns -0 into 0
  return n >= 0 ? Math.floor(n) : null;
}

// Plus-minus always shows its sign (+3, -2, 0), never "-0.0".
function signed(text) {
  const n = Number(text);
  if (n > 0) return `+${text}`;
  return n === 0 ? text.replace('-', '') : text;
}

// Pass the stat key so plus-minus gets its sign.
export const fmtAvg = (v, key) => (v == null ? '—' : key === 'plusMinus' ? signed(v.toFixed(1)) : v.toFixed(1));
export const fmtStat = (v, key) => (v == null ? '—' : key === 'plusMinus' ? signed(String(v)) : String(v));

// Shooting: "4-9" in a box score, "44.4%" as a percentage (a 0–1 fraction).
export const fmtShots = (made, att) => (made == null || att == null ? '—' : `${made}-${att}`);
export const fmtPct = (p) => (p == null ? '—' : `${(100 * p).toFixed(1)}%`);
