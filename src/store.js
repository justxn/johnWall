import { onAuthStateChanged } from 'firebase/auth';
import { collection, collectionGroup, doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase.js';

// Live mirror of Firestore. stats/votes/rsvps come from collection-group
// queries; each doc carries its gameId so we never have to walk subcollections.
export const state = {
  players: [],
  games: [],
  stats: [],
  votes: [],
  rsvps: [],
  categories: [],
  injuries: [],
  team: null, // config/public ({ teamName, seeded }), null until someone creates it
  teamSynced: false, // config/public confirmed by the server, not just the offline cache
  uid: undefined, // undefined = auth not checked yet, null = not signed in
  member: null, // members/{uid}: { role: 'team' | 'fan', playerId?, name? }
  members: [], // everyone who joined (only loaded for team members)
  codes: null, // config/group ({ code, viewerCode }), only readable by team members
  loaded: new Set(),
  error: null,
  online: navigator.onLine,
};

const PUBLIC = ['players', 'games', 'stats', 'votes', 'rsvps', 'categories', 'injuries', 'team'];
const listeners = new Set();

export const isReady = () =>
  PUBLIC.every((k) => state.loaded.has(k)) && state.uid !== undefined && (state.uid === null || state.loaded.has('member'));

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const notify = () => listeners.forEach((fn) => fn());

function mark(key) {
  state.loaded.add(key);
  notify();
}

function fail(key, err) {
  console.error(`Firestore ${key} listener failed`, err);
  state.error = err;
  notify();
}

// Timestamps become plain millis so the rest of the app can sort and compare them.
function plain(d) {
  const data = d.data({ serverTimestamps: 'estimate' });
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v.toMillis === 'function') data[k] = v.toMillis();
  }
  return { id: d.id, ...data };
}

function watch(key, query) {
  onSnapshot(
    query,
    (snap) => {
      state[key] = snap.docs.map(plain);
      mark(key);
    },
    (err) => fail(key, err),
  );
}

let memberUnsub = null;
let teamUnsubs = [];
let memberConfirmed = false; // the server has confirmed this device's membership

function stopTeamListeners() {
  teamUnsubs.forEach((u) => u());
  teamUnsubs = [];
  state.members = [];
  state.codes = null;
}

// The member list and join codes are team-only, so listen only while on the
// team (as confirmed by the server). If the server refuses, start over shortly.
function syncTeamListeners() {
  const onTeam = memberConfirmed && state.member?.role === 'team';
  if (onTeam && !teamUnsubs.length) {
    const quiet = (err) => {
      console.warn('Team-only listener stopped', err);
      stopTeamListeners();
      setTimeout(syncTeamListeners, 5000);
    };
    teamUnsubs = [
      onSnapshot(collection(db, 'members'), (snap) => {
        state.members = snap.docs.map(plain);
        notify();
      }, quiet),
      onSnapshot(doc(db, 'config', 'group'), (snap) => {
        state.codes = snap.exists() ? snap.data() : null;
        notify();
      }, quiet),
    ];
  } else if (!onTeam && teamUnsubs.length) {
    stopTeamListeners();
  }
}

export function startSync() {
  watch('players', collection(db, 'players'));
  watch('games', collection(db, 'games'));
  watch('categories', collection(db, 'awardCategories'));
  watch('injuries', collection(db, 'injuries'));
  watch('stats', collectionGroup(db, 'stats'));
  watch('votes', collectionGroup(db, 'votes'));
  watch('rsvps', collectionGroup(db, 'rsvps'));

  // Metadata changes matter here: one-time setup only runs once the server has
  // confirmed this doc, never off a stale offline copy.
  onSnapshot(
    doc(db, 'config', 'public'),
    { includeMetadataChanges: true },
    (snap) => {
      state.team = snap.exists() ? snap.data() : null;
      state.teamSynced = !snap.metadata.fromCache;
      mark('team');
    },
    (err) => fail('team', err),
  );

  onAuthStateChanged(auth, (user) => {
    state.uid = user ? user.uid : null;
    memberUnsub?.();
    memberUnsub = null;
    state.member = null;
    memberConfirmed = false;
    state.loaded.delete('member');
    stopTeamListeners();
    if (user) {
      memberUnsub = onSnapshot(
        doc(db, 'members', user.uid),
        { includeMetadataChanges: true },
        (snap) => {
          // While joining, Firestore shows the new member doc before the server
          // has checked the code. Wait for the server on a first join (so a
          // wrong code never flashes the team view), but show later changes
          // (like picking your player) right away.
          const pending = snap.metadata.hasPendingWrites;
          if (!pending || memberConfirmed) state.member = snap.exists() ? snap.data() : null;
          if (!pending) memberConfirmed = snap.exists();
          mark('member');
          syncTeamListeners();
        },
        (err) => {
          console.error('Member listener failed', err);
          mark('member');
        },
      );
    }
    notify();
  });

  addEventListener('online', () => {
    state.online = true;
    notify();
  });
  addEventListener('offline', () => {
    state.online = false;
    notify();
  });
}

// Shared lookups.
export const sortedPlayers = () => [...state.players].sort((a, b) => a.name.localeCompare(b.name));
export const activePlayers = () => sortedPlayers().filter((p) => p.active !== false);
export const findGame = (id) => state.games.find((g) => g.id === id) || null;
export const findPlayer = (id) => state.players.find((p) => p.id === id) || null;
export const gameStats = (gameId) => state.stats.filter((s) => s.gameId === gameId);
export const gameRsvps = (gameId) => state.rsvps.filter((r) => r.gameId === gameId);
export const activeInjuries = () => state.injuries.filter((i) => !i.clearedOn);
export const injuryOf = (playerId) => activeInjuries().find((i) => i.playerId === playerId) || null;
export const teamName = () => state.team?.teamName || 'Intramural Hoops';
