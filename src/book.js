// The sportsbook: over/under player props bet with in-app coins (no real
// money). Lines and bets are stored per game; everything else (results,
// coins, the bettor leaderboard) is worked out from them and the box scores,
// the same way award winners come from votes.
import { STAT_LABELS, fmtStat, isFinal } from './stats.js';

export const START_COINS = 1000;
export const MAX_STAKE = 250;
// Games of a stat a player needs before they get an automatic line.
export const MIN_GAMES = 2;

// Stats you can bet on, in board order. Minutes are left out: they're about
// playing time, not play.
export const PROP_STATS = ['points', 'fg3m', 'rebounds', 'assists', 'steals', 'blocks', 'turnovers', 'plusMinus'];
export const PROP_LABELS = { ...STAT_LABELS, fg3m: '3PM' };
export const PROP_NOUNS = {
  points: 'points', fg3m: 'threes', rebounds: 'rebounds', assists: 'assists', steals: 'steals', blocks: 'blocks', turnovers: 'turnovers', plusMinus: 'plus-minus',
};

// 1250 -> "1,250"
export const fmtCoins = (n) => Math.round(n).toLocaleString();
// Up or down, with the sign: "+150", "−50", "0".
export const fmtNet = (n) => (n > 0 ? `+${fmtCoins(n)}` : n < 0 ? `−${fmtCoins(-n)}` : '0');

export const lineId = (playerId, stat) => `${playerId}_${stat}`;

// The automatic line: half a point above the player's average rounded down
// (an average of 7.2 or 7.8 makes 7.5), so a bet can't tie. Needs MIN_GAMES
// finished games with the stat tracked.
export function autoLine(playerId, stat, stats) {
  const vals = stats.filter((s) => s.playerId === playerId && s[stat] != null).map((s) => s[stat]);
  if (vals.length < MIN_GAMES) return null;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.floor(avg + 1e-9) + 0.5; // the allowance keeps 7.0 from rounding down to 6.99…
}

// The automatic lines a game should have, for active players who aren't
// listed as out: [{ id, playerId, stat, line }].
export function autoLines(players, stats, outIds = new Set()) {
  return players
    .filter((p) => p.active !== false && !outIds.has(p.id))
    .flatMap((p) => PROP_STATS.map((stat) => ({ id: lineId(p.id, stat), playerId: p.id, stat, line: autoLine(p.id, stat, stats) })))
    .filter((l) => l.line != null);
}

// What to write so a game's posted lines keep up with the stats: new props go
// up, automatic lines follow the averages, and automatic props for players
// who are no longer eligible come down. Lines a team member set or pulled by
// hand (auto: false) are left alone. Returns { set: [line], remove: [id] }.
export function syncLines(posted, wanted) {
  const byId = new Map(posted.map((l) => [l.id, l]));
  const wantedIds = new Set(wanted.map((w) => w.id));
  return {
    set: wanted.filter((w) => !byId.has(w.id) || (byId.get(w.id).auto && byId.get(w.id).line !== w.line)),
    remove: posted.filter((l) => l.auto && !wantedIds.has(l.id)).map((l) => l.id),
  };
}

// Betting closes at tip-off: once live scoring starts, the game is over, or
// its start time has passed (a game with no time closes at the end of its day).
export function bettingOpen(game, now = new Date()) {
  if ((game.status || 'final') !== 'scheduled') return false;
  if (!game.date) return true;
  return now < new Date(`${game.date}T${game.time || '23:59'}`);
}

// How a bet came out once its game is final: 'won', 'lost', 'push' (right on
// a whole-number line) or 'void' (didn't play, or the stat wasn't tracked).
// Pushes and voids give the stake back.
export function grade(bet, statLine) {
  const value = statLine?.[bet.stat];
  if (value == null) return 'void';
  if (value === bet.line) return 'push';
  return (value > bet.line) === (bet.side === 'over') ? 'won' : 'lost';
}

// Coins and records for everyone who has bet: { [bettorId]: { coins, held,
// available, won, lost, pushed, open, name } }. Bets pay even money. Stakes on
// games that aren't final yet are held; bets on deleted games don't count.
export function ledger(bets, games, stats) {
  const status = new Map(games.map((g) => [g.id, isFinal(g)]));
  const lines = new Map(stats.map((s) => [`${s.gameId}_${s.playerId}`, s]));
  const out = {};
  const ordered = [...bets].sort((a, b) => (a.placedAt ?? 0) - (b.placedAt ?? 0));
  for (const bet of ordered) {
    if (!status.has(bet.gameId)) continue;
    const b = (out[bet.bettorId] ??= { bettorId: bet.bettorId, coins: START_COINS, held: 0, won: 0, lost: 0, pushed: 0, open: 0 });
    b.name = bet.bettorName; // the latest bet's name wins
    if (!status.get(bet.gameId)) {
      b.held += bet.stake;
      b.open += 1;
      continue;
    }
    const result = grade(bet, lines.get(`${bet.gameId}_${bet.playerId}`));
    if (result === 'won') {
      b.coins += bet.stake;
      b.won += 1;
    } else if (result === 'lost') {
      b.coins -= bet.stake;
      b.lost += 1;
    } else {
      b.pushed += 1;
    }
  }
  for (const b of Object.values(out)) b.available = b.coins - b.held;
  return out;
}

// A bettor's numbers, including someone who hasn't bet yet.
export const coinsOf = (book, bettorId) =>
  book[bettorId] ?? { bettorId, coins: START_COINS, held: 0, available: START_COINS, won: 0, lost: 0, pushed: 0, open: 0 };

// Why a bet can't be placed, or null when it can.
export function betProblem({ stake, side, playerId }, { available, myPlayerId = null }) {
  if (!Number.isInteger(stake) || stake < 1) return 'Pick how many coins to bet.';
  if (stake > MAX_STAKE) return `The most you can bet is ${MAX_STAKE}.`;
  if (stake > available) return `You have ${available} coins to bet.`;
  if (side === 'under' && playerId === myPlayerId) return "You can't bet the under on yourself.";
  return null;
}

// The number a bet needs: the lowest that wins an over, the highest that wins
// an under. On a whole-number line, the line itself is a push.
export const target = ({ side, line }) => (side === 'over' ? Math.floor(line) + 1 : Math.ceil(line) - 1);

// What a bet needs to win, e.g. "8 or more points", "+2 or worse".
export function winsWith(bet) {
  const n = target(bet);
  if (bet.stat === 'plusMinus') return `${fmtStat(n, 'plusMinus')} or ${bet.side === 'over' ? 'better' : 'worse'}`;
  return `${n} or ${bet.side === 'over' ? 'more' : 'fewer'} ${PROP_NOUNS[bet.stat]}`;
}

// How a bet is doing while its game is live: the stat so far and whether
// that would win right now. Null when the stat isn't being tracked.
export function liveStatus(bet, statLine) {
  const value = statLine?.[bet.stat];
  if (value == null) return null;
  const need = target(bet);
  return { value, need, winning: bet.side === 'over' ? value >= need : value <= need };
}

// "Over 7.5 PTS", with plus-minus lines signed.
export const pickLabel = ({ stat, side, line }) =>
  `${side === 'over' ? 'Over' : 'Under'} ${stat === 'plusMinus' && line > 0 ? '+' : ''}${line} ${PROP_LABELS[stat]}`;
