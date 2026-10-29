import { signInAnonymously, signOut } from 'firebase/auth';
import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { auth, db } from './firebase.js';
import { state } from './store.js';

// Anyone with the link can look around. Joining signs this device in
// anonymously (no account or password) and proves the code to Firestore's
// security rules, which compare it against config/group. No browser can read
// that doc, so the codes never leave the server.
//
// Roles: 'team' (players and whoever keeps score) can change anything; 'fan'
// can vote for awards.

export const role = () => state.member?.role ?? null;
export const isTeam = () => role() === 'team';
export const isMember = () => role() != null;
export const myPlayerId = () => (isTeam() && state.member?.playerId) || null;
// Players vote as their player (one vote per player, whatever the device);
// everyone else votes as this device.
export const voterKey = () => myPlayerId() || state.uid;

// The previous version kept the code and chosen player in localStorage; use them
// to pre-fill the join form once.
const readLegacy = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
export const legacyCode = () => readLegacy('hoops.code') || '';
export const legacyPlayerId = () => {
  const id = readLegacy('hoops.me');
  return id && !id.startsWith('guest-') ? id : null;
};
function clearLegacy() {
  try {
    ['hoops.code', 'hoops.guest'].forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
}
export function clearLegacyPlayer() {
  try {
    localStorage.removeItem('hoops.me');
  } catch { /* ignore */ }
}

async function signIn() {
  if (!auth.currentUser) await signInAnonymously(auth);
  return auth.currentUser.uid;
}

// The rules accept the member doc only if the code written to joins/{uid} in
// the same batch matches the code for that role.
function joinBatch(uid, code, joinRole) {
  const batch = writeBatch(db);
  batch.set(doc(db, 'joins', uid), { code });
  batch.set(doc(db, 'members', uid), { role: joinRole, joinedAt: serverTimestamp() }, { merge: true });
  return batch;
}

// Tries the code as the team code, then as the fan code. Resolves to the role
// joined, or null when it matches neither.
export async function join(code) {
  const trimmed = code.trim();
  if (!trimmed) return null;
  const uid = await signIn();
  for (const joinRole of ['team', 'fan']) {
    try {
      await joinBatch(uid, trimmed, joinRole).commit();
      clearLegacy();
      return joinRole;
    } catch (err) {
      if (err.code !== 'permission-denied') throw err;
    }
  }
  return null;
}

// First-time setup: stores the codes and makes this device the first team
// member. The rules only allow it while no team exists yet.
export async function createTeam({ teamName, code, fanCode }) {
  const uid = await signIn();
  const batch = joinBatch(uid, code, 'team');
  batch.set(doc(db, 'config', 'group'), { code, viewerCode: fanCode });
  await batch.commit();
  await setDoc(doc(db, 'config', 'public'), { teamName }, { merge: true });
  clearLegacy();
}

export const claimPlayer = (playerId) => updateDoc(doc(db, 'members', state.uid), { playerId });
export const setMyName = (name) => updateDoc(doc(db, 'members', state.uid), { name: name.trim() });

// Takes this device off the team and signs it out. Needs a connection, since
// the delete has to reach the server before the sign-in goes away.
export async function leave() {
  if (state.uid && state.member) await deleteDoc(doc(db, 'members', state.uid));
  await signOut(auth);
  clearLegacyPlayer();
}
