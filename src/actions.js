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
import { gameRsvps, gameStats, state } from './store.js';
import { voteId } from './awards.js';
import { voterKey } from './auth.js';
import { STAT_KEYS } from './stats.js';
import { clockToggle, courtToggle, finalMinutes } from './live.js';
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
  gameRsvps(game.id).forEach((r) => batch.delete(doc(db, 'games', game.id, 'rsvps', r.id)));
  state.votes.filter((v) => v.gameId === game.id).forEach((v) => batch.delete(doc(db, 'games', game.id, 'votes', v.id)));
  batch.delete(gameRef(game.id));
  return send(batch.commit(), 'Delete');
}

export function setRsvp(gameId, playerId, status) {
  const ref = doc(db, 'games', gameId, 'rsvps', playerId);
  return send(status ? setDoc(ref, { gameId, playerId, status, updatedAt: serverTimestamp() }) : deleteDoc(ref), 'RSVP');
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
const zeroLine = (gameId, playerId, tracked) => ({
  gameId,
  playerId,
  ...Object.fromEntries(STAT_KEYS.map((k) => [k, tracked.includes(k) ? 0 : null])),
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

// Points also move the team score, so the box score and the final always agree.
export function scorePlayer(gameId, playerId, stat, n) {
  const batch = writeBatch(db);
  batch.update(statRef(gameId, playerId), { [stat]: increment(n) });
  if (stat === 'points') batch.update(gameRef(gameId), { teamScore: increment(n) });
  return send(batch.commit(), 'Score');
}

export const scoreOpponent = (gameId, n) => send(updateDoc(gameRef(gameId), { opponentScore: increment(n) }), 'Score');

function applyLive(gameId, { set, remove }) {
  const update = { ...set };
  remove.forEach((path) => {
    update[path] = deleteField();
  });
  return send(updateDoc(gameRef(gameId), update), 'Live game');
}
export const toggleClock = (game) => applyLive(game.id, clockToggle(game.live));
export const toggleCourt = (game, playerId) => applyLive(game.id, courtToggle(game.live, playerId));

export function finishLive(game) {
  const batch = writeBatch(db);
  const lines = gameStats(game.id);
  if (game.live?.tracked?.includes('minutes')) {
    const minutes = finalMinutes(game.live, lines.map((s) => s.playerId));
    lines.forEach((s) => batch.update(statRef(game.id, s.id), { minutes: minutes[s.playerId] }));
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
