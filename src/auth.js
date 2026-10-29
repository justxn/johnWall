import { doc, setDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase.js';
import { state } from './store.js';

// Identity is just localStorage: the group code that was accepted and the
// player the visitor picked. Storage can throw (private windows), so guard it.
const get = (k) => {
  try { return localStorage.getItem(k); } catch { return null; }
};
const set = (k, v) => {
  try {
    if (v == null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch { /* ignore */ }
};

export const hasAccess = () => state.group != null && get('hoops.code') === state.group.code;
export const myId = () => get('hoops.me');
export const me = () => state.players.find((p) => p.id === myId()) || null;

export async function enterCode(code) {
  const trimmed = code.trim();
  if (!trimmed) return false;
  if (state.group == null) {
    // First visitor chooses the group code.
    await setDoc(doc(db, 'config', 'group'), { code: trimmed });
    set('hoops.code', trimmed);
    return true;
  }
  if (state.group.code !== trimmed) return false;
  set('hoops.code', trimmed);
  return true;
}

export const pickPlayer = (id) => set('hoops.me', id);

export function signOut() {
  set('hoops.me', null);
  set('hoops.code', null);
}

export async function addPlayer(name) {
  const ref = await addDoc(collection(db, 'players'), {
    name: name.trim(),
    createdAt: serverTimestamp(),
  });
  return ref.id;
}
