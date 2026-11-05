import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase.js';
import { activeInjuries, gameBets, gameLines, gameStats, state } from './store.js';
import { voteId } from './awards.js';
import { voterKey } from './auth.js';
import { SHOOTING_FIELDS, STAT_KEYS, finalStats } from './stats.js';
import { autoLines, bettingOpen, lineId, syncLines } from './book.js';
import { clockToggle, courtToggle, courtUsed, finalMinutes } from './live.js';
import { toast } from './ui.js';

// Firestore applies writes on this device right away (and queues them while
// offline), so nothing here waits for the server before moving on. If the
// server rejects a write, the change rolls back and we say so.
function send(promise, what) {
  promise.catch((err) => {
    console.error(err);
    toast(`${what} didn't save: ${describeError(err)}`, 'error');
  });
  return promise;
}

export function describeError(err) {
  if (err?.code === 'permission-denied') return "you don't have permission to do that";
  if (err?.code === 'unavailable') return 'no connection';
  return err?.message || 'something went wrong';
}

const gameRef = (id) => doc(db, 'games', id);
const statRef = (gameId, playerId) => doc(db, 'games', gameId, 'stats', playerId);

// Ids are made up front (once per form), so a double-tapped Save writes the
// same game twice instead of creating two games.
export const newGameId = () => doc(collection(db, 'games')).id;

export function saveScheduled(id, { date, time, opponent, location }, { isNew }) {
  const data = { status: 'scheduled', date, time, opponent, location };
  if (isNew) Object.assign(data, { teamScore: null, opponentScore: null, notes: '', createdAt: serverTimestamp() });
  return send(setDoc(gameRef(id), data, { merge: true }), 'Game');
}

// Final score plus box score. `lines` maps playerId -> stat line, or null for
// players who didn't play.
export function saveResult(id, fields, lines, { isNew }) {
  const batch = writeBatch(db);
  const data = { ...fields, status: 'final', live: deleteField() };
  if (isNew) data.createdAt = serverTimestamp();
  batch.set(gameRef(id), data, { merge: true });
  const existing = new Set(gameStats(id).map((s) => s.playerId));
  for (const [playerId, line] of Object.entries(lines)) {
    if (line) batch.set(statRef(id, playerId), { gameId: id, playerId, ...line });
    else if (existing.has(playerId)) batch.delete(statRef(id, playerId));
  }
  return send(batch.commit(), 'Game');
}

export function deleteGame(game) {
  const batch = writeBatch(db);
  gameStats(game.id).forEach((s) => batch.delete(statRef(game.id, s.id)));
  state.votes.filter((v) => v.gameId === game.id).forEach((v) => batch.delete(doc(db, 'games', game.id, 'votes', v.id)));
  gameBets(game.id).forEach((b) => batch.delete(doc(db, 'games', game.id, 'bets', b.id)));
  gameLines(game.id).forEach((l) => batch.delete(lineRef(game.id, l.id)));
  batch.delete(gameRef(game.id));
  return send(batch.commit(), 'Delete');
}

export const myVote = (gameId, categoryId) =>
  state.votes.find((v) => v.gameId === gameId && v.categoryId === categoryId && v.voterId === voterKey());

export function castVote(gameId, categoryId, nomineeId) {
  const voterId = voterKey();
  const ref = doc(db, 'games', gameId, 'votes', voteId(voterId, categoryId));
  return send(nomineeId ? setDoc(ref, { gameId, categoryId, voterId, nomineeId }) : deleteDoc(ref), 'Vote');
}

// --- Live scoring -----------------------------------------------------------

// Tracked stats start at 0; untracked ones stay null ("not tracked").
// 'shooting' in `tracked` means makes and misses are being kept.
const zeroLine = (gameId, playerId, tracked) => ({
  gameId,
  playerId,
  ...Object.fromEntries(STAT_KEYS.map((k) => [k, tracked.includes(k) ? 0 : null])),
  ...Object.fromEntries(SHOOTING_FIELDS.map((k) => [k, tracked.includes('shooting') ? 0 : null])),
});

// `game` may be a brand-new game (no doc yet) or a scheduled one.
export function startLive(game, playerIds, tracked, { isNew }) {
  const batch = writeBatch(db);
  const live = { clockBase: 0, clockStartedAt: null, onCourt: {}, played: {}, tracked };
  const fields = { status: 'live', teamScore: 0, opponentScore: 0, live };
  if (isNew) {
    const { id, ...details } = game;
    batch.set(gameRef(id), { notes: '', ...details, ...fields, createdAt: serverTimestamp() });
  } else {
    batch.update(gameRef(game.id), fields);
    gameStats(game.id)
      .filter((s) => !playerIds.includes(s.playerId))
      .forEach((s) => batch.delete(statRef(game.id, s.id)));
  }
  playerIds.forEach((pid) => batch.set(statRef(game.id, pid), zeroLine(game.id, pid, tracked)));
  return send(batch.commit(), 'Live game');
}

export const addLivePlayer = (game, playerId) =>
  send(setDoc(statRef(game.id, playerId), zeroLine(game.id, playerId, game.live?.tracked ?? STAT_KEYS)), 'Player');

// One tap's stat changes for a player, e.g. { points: 2, fgm: 1, fga: 1 } for
// a made shot. Points also move the team score, so the box score and the final
// always agree, and go into the plus-minus of everyone in `court` (who was on
// the floor, from plusMinusCourt). Undo sends the same changes negated.
export function scorePlayer(gameId, playerId, deltas, court = []) {
  const batch = writeBatch(db);
  const changes = { [playerId]: Object.fromEntries(Object.entries(deltas).map(([k, n]) => [k, increment(n)])) };
  if (deltas.points) {
    batch.update(gameRef(gameId), { teamScore: increment(deltas.points) });
    for (const pid of court) changes[pid] = { ...changes[pid], plusMinus: increment(deltas.points) };
  }
  for (const [pid, fields] of Object.entries(changes)) batch.update(statRef(gameId, pid), fields);
  return send(batch.commit(), 'Score');
}

export function scoreOpponent(gameId, n, court = []) {
  const batch = writeBatch(db);
  batch.update(gameRef(gameId), { opponentScore: increment(n) });
  for (const pid of court) batch.update(statRef(gameId, pid), { plusMinus: increment(-n) });
  return send(batch.commit(), 'Score');
}

function applyLive(gameId, { set, remove }) {
  const update = { ...set };
  remove.forEach((path) => {
    update[path] = deleteField();
  });
  return send(updateDoc(gameRef(gameId), update), 'Live game');
}
export const toggleClock = (game) => applyLive(game.id, clockToggle(game.live));
export const toggleCourt = (game, playerId) => applyLive(game.id, courtToggle(game.live, playerId));

// Minutes get banked into the box score. If nobody was ever put on the court,
// minutes and plus-minus are saved as "not tracked" instead of all zeros.
export function finishLive(game) {
  const batch = writeBatch(db);
  const lines = gameStats(game.id);
  const tracked = game.live?.tracked ?? [];
  const used = courtUsed(game.live);
  const minutes = finalMinutes(game.live, lines.map((s) => s.playerId));
  for (const s of lines) {
    const fields = {};
    if (tracked.includes('minutes')) fields.minutes = used ? minutes[s.playerId] : null;
    if (tracked.includes('plusMinus') && !used) fields.plusMinus = null;
    if (Object.keys(fields).length) batch.update(statRef(game.id, s.id), fields);
  }
  batch.update(gameRef(game.id), { status: 'final', live: deleteField() });
  return send(batch.commit(), 'Final score');
}

// Back to an upcoming game, throwing away the live box score.
export function cancelLive(game) {
  const batch = writeBatch(db);
  gameStats(game.id).forEach((s) => batch.delete(statRef(game.id, s.id)));
  batch.update(gameRef(game.id), { status: 'scheduled', teamScore: null, opponentScore: null, live: deleteField() });
  return send(batch.commit(), 'Cancel');
}

// --- Sportsbook ---------------------------------------------------------------

const lineRef = (gameId, id) => doc(db, 'games', gameId, 'lines', id);
const sentLines = new Map(); // gameId -> the last update sent, so it isn't sent again while it lands

// Keeps the automatic prop lines of every game still open for betting in step
// with the stats (see syncLines in book.js). Runs on team members' phones
// whenever data changes, and writes nothing when the lines are already right.
export function syncAllLines() {
  const done = finalStats(state.games, state.stats);
  const out = new Set(activeInjuries().filter((i) => i.status === 'out').map((i) => i.playerId));
  const wanted = autoLines(state.players, done, out);
  for (const game of state.games.filter((g) => bettingOpen(g))) {
    const { set, remove } = syncLines(gameLines(game.id), wanted);
    if (!set.length && !remove.length) {
      sentLines.delete(game.id);
      continue;
    }
    const key = JSON.stringify([set, remove]);
    if (sentLines.get(game.id) === key) continue;
    sentLines.set(game.id, key);
    const batch = writeBatch(db);
    for (const l of set) {
      batch.set(lineRef(game.id, l.id), { gameId: game.id, playerId: l.playerId, stat: l.stat, line: l.line, auto: true, pulled: false, updatedAt: serverTimestamp() });
    }
    for (const id of remove) batch.delete(lineRef(game.id, id));
    send(batch.commit(), 'Prop lines');
  }
}

// A team member setting a line by hand, or pulling a prop ({ pulled: true }).
// Hand-set lines stop following the averages; { auto: true } hands one back.
export const setLine = (gameId, { playerId, stat }, fields) =>
  send(
    setDoc(lineRef(gameId, lineId(playerId, stat)), { gameId, playerId, stat, auto: false, pulled: false, ...fields, updatedAt: serverTimestamp() }, { merge: true }),
    'Line',
  );

// Bets can't be changed once placed, only cancelled before tip-off.
export function placeBet(gameId, bet) {
  const ref = doc(collection(db, 'games', gameId, 'bets'));
  return send(setDoc(ref, { gameId, ...bet, placedAt: serverTimestamp() }), 'Bet');
}
export const cancelBet = (bet) => send(deleteDoc(doc(db, 'games', bet.gameId, 'bets', bet.id)), 'Cancel');

// --- Injuries ---------------------------------------------------------------
export function saveInjury(id, fields) {
  const ref = id ? doc(db, 'injuries', id) : doc(collection(db, 'injuries'));
  return send(setDoc(ref, { ...fields, updatedAt: serverTimestamp() }, { merge: true }), 'Injury report');
}
export const clearInjury = (id, date) =>
  send(updateDoc(doc(db, 'injuries', id), { clearedOn: date, updatedAt: serverTimestamp() }), 'Injury report');
export const deleteInjury = (id) => send(deleteDoc(doc(db, 'injuries', id)), 'Delete');

// --- Roster, awards, team ---------------------------------------------------
export function addPlayer(name) {
  const ref = doc(collection(db, 'players'));
  send(setDoc(ref, { name: name.trim(), active: true, createdAt: serverTimestamp() }), 'Player');
  return ref.id;
}
export const updatePlayer = (id, fields) => send(updateDoc(doc(db, 'players', id), fields), 'Player');
export const deletePlayer = (id) => send(deleteDoc(doc(db, 'players', id)), 'Delete');

export const addCategory = (name) =>
  send(setDoc(doc(collection(db, 'awardCategories')), { name: name.trim(), isDefault: false }), 'Award');

// Removing an award also clears its votes so they don't linger in the database.
export function removeCategory(id) {
  const batch = writeBatch(db);
  state.votes.filter((v) => v.categoryId === id).forEach((v) => batch.delete(doc(db, 'games', v.gameId, 'votes', v.id)));
  batch.delete(doc(db, 'awardCategories', id));
  return send(batch.commit(), 'Remove');
}

export const setTeamName = (teamName) => send(setDoc(doc(db, 'config', 'public'), { teamName }, { merge: true }), 'Team name');
export const setCodes = (codes) => send(updateDoc(doc(db, 'config', 'group'), codes), 'Codes');
export const setMemberRole = (uid, role) => send(updateDoc(doc(db, 'members', uid), { role }), 'Member');
export const removeMember = (uid) => send(deleteDoc(doc(db, 'members', uid)), 'Remove');
