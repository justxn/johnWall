import { signInAnonymously, signOut } from 'firebase/auth';
import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { auth, db } from './firebase.js';
import { changed, state } from './store.js';

// Anyone with the link can look around. Joining works one of two ways,
// depending on how the Firebase project is set up:
//
// - Basic (the original open rules, nothing to set up): the codes are readable,
//   so the phone checks the code and remembers it, exactly like the first
//   version of the app. Codes saved by the first version keep working.
// - Secure (after turning on Anonymous sign-in and publishing firestore.rules):
//   joining signs the phone in anonymously and the database checks the code,
//   so the codes never reach a browser.
//
// The app switches to secure mode by itself once the codes stop being readable.
//
// Roles: 'team' (players and whoever keeps score) can change anything; 'fan'
// can vote for awards.

// Basic mode keeps the first version's localStorage keys: hoops.code (the code
// entered), hoops.me (player id, or a guest id) and hoops.guest (fan name).
const read = (k) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k, v) => {
  try {
    if (v == null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch { /* private windows can refuse storage */ }
};

// Which role a code gives, checked against the codes in config/group.
export function codeRole(code, codes) {
  if (!code || !codes) return null;
  if (code === codes.code) return 'team';
  if (codes.viewerCode && code === codes.viewerCode) return 'fan';
  return null;
}

// True when this phone joined through a sign-in (secure mode).
export const usesSignIn = () => Boolean(state.member);
// True while the database still has the original open rules.
export const basicMode = () => !usesSignIn() && state.codesReadable;

export const role = () => (state.member ? state.member.role : codeRole(read('hoops.code'), state.codes));
export const isTeam = () => role() === 'team';
export const isMember = () => role() != null;

const savedPlayerId = () => {
  const id = read('hoops.me');
  return id && !id.startsWith('guest-') ? id : null;
};
export const myPlayerId = () => {
  if (!isTeam()) return null;
  return state.member ? state.member.playerId || null : savedPlayerId();
};
export const myName = () => (state.member ? state.member.name : read('hoops.guest')) || '';

// A lasting id for this phone's votes when it isn't voting as a player. Fans
// from the first version keep their old guest id, so their votes carry over.
function deviceId() {
  let id = read('hoops.voter');
  if (!id) {
    const old = read('hoops.me');
    id = old?.startsWith('guest-') ? old : `guest-${Math.random().toString(36).slice(2, 10)}`;
    write('hoops.voter', id);
  }
  return id;
}
// Players vote as their player (one vote per player, whatever the device);
// everyone else votes as their sign-in or this phone.
export const voterKey = () => myPlayerId() || state.uid || deviceId();

// For the join form: whatever this phone saved before (first version or basic mode).
export const legacyCode = () => read('hoops.code') || '';
export const legacyPlayerId = savedPlayerId;

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

// Resolves to the role joined, or null when the code matches neither code.
export async function join(code) {
  const trimmed = code.trim();
  if (!trimmed) return null;
  if (basicMode()) {
    const joined = codeRole(trimmed, state.codes);
    if (joined) {
      write('hoops.code', trimmed);
      changed();
    }
    return joined;
  }
  // Secure mode: try it as the team code, then as the fan code.
  const uid = await signIn();
  for (const joinRole of ['team', 'fan']) {
    try {
      await joinBatch(uid, trimmed, joinRole).commit();
      write('hoops.code', null);
      write('hoops.guest', null);
      return joinRole;
    } catch (err) {
      if (err.code !== 'permission-denied') throw err;
    }
  }
  return null;
}

// First-time setup: stores the codes and makes this phone the first team
// member. Only allowed while no team exists yet (basic mode checks with the
// server first; in secure mode the rules enforce it).
export async function createTeam({ teamName, code, fanCode }) {
  if (basicMode()) {
    if (state.codes || !state.codesSynced) throw Object.assign(new Error('This app already has a team'), { code: 'permission-denied' });
    await setDoc(doc(db, 'config', 'group'), { code, viewerCode: fanCode });
    await setDoc(doc(db, 'config', 'public'), { teamName }, { merge: true });
    write('hoops.code', code);
    changed();
    return;
  }
  const uid = await signIn();
  const batch = joinBatch(uid, code, 'team');
  batch.set(doc(db, 'config', 'group'), { code, viewerCode: fanCode });
  await batch.commit();
  await setDoc(doc(db, 'config', 'public'), { teamName }, { merge: true });
  write('hoops.code', null);
}

export async function claimPlayer(playerId) {
  if (usesSignIn()) {
    write('hoops.me', null);
    return updateDoc(doc(db, 'members', state.uid), { playerId });
  }
  write('hoops.me', playerId);
  changed();
}

export async function setMyName(name) {
  if (usesSignIn()) return updateDoc(doc(db, 'members', state.uid), { name: name.trim() });
  write('hoops.guest', name.trim());
  changed();
}

// Takes this phone off the team. With a sign-in this needs a connection, since
// the delete has to reach the server before the sign-in goes away.
export async function leave() {
  if (usesSignIn()) {
    await deleteDoc(doc(db, 'members', state.uid));
    await signOut(auth);
  }
  ['hoops.code', 'hoops.me', 'hoops.guest'].forEach((k) => write(k, null));
  changed();
}
