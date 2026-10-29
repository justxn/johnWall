import { collection, collectionGroup, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from './firebase.js';

// Live mirror of Firestore. stats/votes come from collection-group queries;
// each doc carries its gameId so we never have to walk subcollections.
export const state = {
  players: [],
  games: [],
  categories: [],
  stats: [],
  votes: [],
  group: undefined, // undefined = not loaded yet, null = no code set
  loaded: new Set(),
};

const WATCHED = ['players', 'games', 'categories', 'stats', 'votes', 'group'];
const listeners = new Set();

export const isReady = () => WATCHED.every((k) => state.loaded.has(k));

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function mark(key) {
  state.loaded.add(key);
  listeners.forEach((fn) => fn());
}

function watch(key, query) {
  onSnapshot(
    query,
    (snap) => {
      state[key] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      mark(key);
    },
    (err) => console.error(`Firestore ${key} listener failed`, err),
  );
}

let seeded = false;

export function startSync() {
  watch('players', collection(db, 'players'));
  watch('games', collection(db, 'games'));
  watch('stats', collectionGroup(db, 'stats'));
  watch('votes', collectionGroup(db, 'votes'));

  onSnapshot(collection(db, 'awardCategories'), (snap) => {
    state.categories = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    mark('categories');
    // Seed the default MVP award once.
    if (!seeded && !snap.docs.some((d) => d.id === 'mvp')) {
      seeded = true;
      setDoc(doc(db, 'awardCategories', 'mvp'), { name: 'MVP', isDefault: true });
    }
  });

  onSnapshot(doc(db, 'config', 'group'), (snap) => {
    state.group = snap.exists() ? snap.data() : null;
    mark('group');
  });
}
