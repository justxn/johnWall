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

// Role is derived from the stored code each time, so changing a code in
// Firestore revokes old access without any cleanup.
export function role() {
  const code = get('hoops.code');
  if (!code || state.group == null) return null;
  if (code === state.group.code) return 'editor';
  if (state.group.viewerCode && code === state.group.viewerCode) return 'viewer';
  return null;
}
export const hasAccess = () => role() != null;
export const isEditor = () => role() === 'editor';
export const myId = () => get('hoops.me');
// Viewers who aren't on the roster are guests: a name kept only in this
// browser, never written to `players`, so they don't appear in stats or lists.
export const isGuest = () => (myId() || '').startsWith('guest-');
export const me = () => {
  if (isGuest()) return { id: myId(), name: get('hoops.guest') || 'Guest' };
  return state.players.find((p) => p.id === myId()) || null;
};

export function enterAsGuest(name) {
  set('hoops.guest', name.trim());
  set('hoops.me', 'guest-' + Math.random().toString(36).slice(2, 10));
}

export async function enterCode(code) {
  const trimmed = code.trim();
  if (!trimmed) return false;
  if (state.group == null) {
    // First visitor chooses the group code.
    await setDoc(doc(db, 'config', 'group'), { code: trimmed });
    set('hoops.code', trimmed);
    return true;
  }
  const ok = trimmed === state.group.code || (state.group.viewerCode && trimmed === state.group.viewerCode);
  if (!ok) return false;
  set('hoops.code', trimmed);
  return true;
}

// Empty string removes the viewer code.
export async function setViewerCode(code) {
  const viewerCode = code.trim();
  await setDoc(doc(db, 'config', 'group'), { viewerCode }, { merge: true });
}

export const pickPlayer = (id) => set('hoops.me', id);

export function signOut() {
  set('hoops.me', null);
  set('hoops.guest', null);
  set('hoops.code', null);
}

export async function addPlayer(name) {
  const ref = await addDoc(collection(db, 'players'), {
    name: name.trim(),
    createdAt: serverTimestamp(),
  });
  return ref.id;
}
