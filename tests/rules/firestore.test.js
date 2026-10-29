import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc, writeBatch } from 'firebase/firestore';

const TEAM_CODE = 'swish-2026';
const FAN_CODE = 'watch-party';

let env;
const db = (uid) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();

// Seeds data with the rules switched off.
async function seed(fn) {
  await env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));
}

function join(uid, code, role, extra = {}) {
  const fs = db(uid);
  const batch = writeBatch(fs);
  batch.set(doc(fs, 'joins', uid), { code });
  batch.set(doc(fs, 'members', uid), { role, joinedAt: new Date(), ...extra }, { merge: true });
  return batch.commit();
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-hoops',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

afterAll(() => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await seed(async (fs) => {
    await setDoc(doc(fs, 'config/group'), { code: TEAM_CODE, viewerCode: FAN_CODE });
    await setDoc(doc(fs, 'config/public'), { teamName: 'John Wall' });
    await setDoc(doc(fs, 'players/p1'), { name: 'Marcus' });
    await setDoc(doc(fs, 'players/p2'), { name: 'Devon' });
    await setDoc(doc(fs, 'games/g1'), { date: '2026-10-28', opponent: 'Air Ballers', teamScore: 21, opponentScore: 18 });
    await setDoc(doc(fs, 'games/g1/stats/p1'), { gameId: 'g1', playerId: 'p1', points: 10 });
    await setDoc(doc(fs, 'members/captain'), { role: 'team', playerId: 'p1' });
    await setDoc(doc(fs, 'members/fan'), { role: 'fan' });
  });
});

describe('reading', () => {
  it('lets anyone read team data, including collection-group queries', async () => {
    await assertSucceeds(getDocs(collection(db(), 'games')));
    await assertSucceeds(getDocs(collectionGroup(db(), 'stats')));
    await assertSucceeds(getDocs(collectionGroup(db(), 'votes')));
    await assertSucceeds(getDoc(doc(db(), 'config/public')));
  });

  it('keeps the join codes away from everyone but the team', async () => {
    await assertFails(getDoc(doc(db(), 'config/group')));
    await assertFails(getDoc(doc(db('stranger'), 'config/group')));
    await assertFails(getDoc(doc(db('fan'), 'config/group')));
    await assertSucceeds(getDoc(doc(db('captain'), 'config/group')));
  });

  it('never lets anyone read back a typed code', async () => {
    await join('newbie', TEAM_CODE, 'team');
    await assertFails(getDoc(doc(db('newbie'), 'joins/newbie')));
    await assertFails(getDoc(doc(db('captain'), 'joins/newbie')));
  });

  it('shows members only to themselves and the team', async () => {
    await assertSucceeds(getDoc(doc(db('fan'), 'members/fan')));
    await assertFails(getDoc(doc(db('fan'), 'members/captain')));
    await assertFails(getDocs(collection(db('fan'), 'members')));
    await assertSucceeds(getDocs(collection(db('captain'), 'members')));
  });
});

describe('joining', () => {
  it('accepts the team code as team and the fan code as fan', async () => {
    await assertSucceeds(join('a', TEAM_CODE, 'team'));
    await assertSucceeds(join('b', FAN_CODE, 'fan'));
  });

  it('rejects wrong codes and codes for the other role', async () => {
    await assertFails(join('a', 'nope', 'team'));
    await assertFails(join('a', FAN_CODE, 'team'));
    await assertFails(join('a', TEAM_CODE.toUpperCase(), 'team'));
    await assertFails(join('a', 'nope', 'fan'));
  });

  it('rejects fan joins when there is no fan code', async () => {
    await seed((fs) => setDoc(doc(fs, 'config/group'), { code: TEAM_CODE, viewerCode: '' }));
    await assertFails(join('a', '', 'fan'));
  });

  it('needs a sign-in, and only for your own uid', async () => {
    const anon = db();
    const batch = writeBatch(anon);
    batch.set(doc(anon, 'joins', 'x'), { code: TEAM_CODE });
    batch.set(doc(anon, 'members', 'x'), { role: 'team' });
    await assertFails(batch.commit());
    const fs = db('a');
    const other = writeBatch(fs);
    other.set(doc(fs, 'joins', 'a'), { code: TEAM_CODE });
    other.set(doc(fs, 'members', 'b'), { role: 'team' });
    await assertFails(other.commit());
  });

  it('does not let a new member link themselves to a player', async () => {
    await assertFails(join('a', FAN_CODE, 'fan', { playerId: 'p2' }));
    await assertFails(join('a', TEAM_CODE, 'team', { playerId: 'p2' }));
  });

  it('lets a fan upgrade with the team code, but not without it', async () => {
    await assertFails(updateDoc(doc(db('fan'), 'members/fan'), { role: 'team' }));
    await assertFails(join('fan', 'nope', 'team'));
    await assertSucceeds(join('fan', TEAM_CODE, 'team'));
  });

  it('lets fans set their name but not link a player', async () => {
    await assertSucceeds(updateDoc(doc(db('fan'), 'members/fan'), { name: 'Sam' }));
    await assertFails(updateDoc(doc(db('fan'), 'members/fan'), { playerId: 'p2' }));
  });

  it('lets the first person create the team, once', async () => {
    await env.clearFirestore();
    const setup = (uid) => {
      const fs = db(uid);
      const batch = writeBatch(fs);
      batch.set(doc(fs, 'config/group'), { code: 'first-code', viewerCode: '' });
      batch.set(doc(fs, 'joins', uid), { code: 'first-code' });
      batch.set(doc(fs, 'members', uid), { role: 'team', joinedAt: new Date() });
      return batch.commit();
    };
    await assertSucceeds(setup('founder'));
    await assertSucceeds(setDoc(doc(db('founder'), 'config/public'), { teamName: 'John Wall' }));
    await assertFails(setup('latecomer'));
  });
});

describe('writing team data', () => {
  it('only lets team members change games, stats, players and the rest', async () => {
    for (const uid of [null, 'stranger', 'fan']) {
      await assertFails(setDoc(doc(db(uid), 'games/g2'), { opponent: 'Hackers' }));
      await assertFails(updateDoc(doc(db(uid), 'games/g1/stats/p1'), { points: 99 }));
      await assertFails(setDoc(doc(db(uid), 'players/p9'), { name: 'Imposter' }));
      await assertFails(setDoc(doc(db(uid), 'injuries/i1'), { playerId: 'p1', status: 'out' }));
      await assertFails(setDoc(doc(db(uid), 'config/public'), { teamName: 'Hacked' }));
    }
    const fs = db('captain');
    await assertSucceeds(setDoc(doc(fs, 'games/g2'), { opponent: 'Brick Squad', status: 'scheduled' }));
    await assertSucceeds(updateDoc(doc(fs, 'games/g1/stats/p1'), { points: 12 }));
    await assertSucceeds(setDoc(doc(fs, 'injuries/i1'), { playerId: 'p2', status: 'out' }));
    await assertSucceeds(updateDoc(doc(fs, 'config/group'), { viewerCode: 'new-fan-code' }));
  });

  it('lets the team manage members, and anyone leave', async () => {
    await assertFails(deleteDoc(doc(db('fan'), 'members/captain')));
    await assertSucceeds(deleteDoc(doc(db('fan'), 'members/fan')));
    await seed((fs) => setDoc(doc(fs, 'members/fan'), { role: 'fan' }));
    await assertSucceeds(updateDoc(doc(db('captain'), 'members/fan'), { role: 'team' }));
  });
});

describe('votes', () => {
  const vote = (uid, voterId, nomineeId, id = `${voterId}_mvp`) =>
    setDoc(doc(db(uid), 'games/g1/votes', id), { gameId: 'g1', categoryId: 'mvp', voterId, nomineeId });

  it('lets fans vote once, as themselves', async () => {
    await assertSucceeds(vote('fan', 'fan', 'p1'));
    await assertSucceeds(vote('fan', 'fan', 'p2')); // changing your vote
    await assertFails(vote('fan', 'p2', 'p1')); // pretending to be a player
    await assertFails(vote('fan', 'fan', 'p1', 'fan_hustle')); // id doesn't match the award
  });

  it('has players vote as their player, never for themselves', async () => {
    await assertSucceeds(vote('captain', 'p1', 'p2'));
    await assertFails(vote('captain', 'p1', 'p1'));
    await assertFails(vote('captain', 'p2', 'p1'));
  });

  it('keeps votes from people who are not members', async () => {
    await assertFails(vote(null, 'x', 'p1'));
    await assertFails(vote('stranger', 'stranger', 'p1'));
  });

  it('does not let one voter overwrite another\'s vote', async () => {
    await seed((fs) => setDoc(doc(fs, 'games/g1/votes/fan_mvp'), { gameId: 'g1', categoryId: 'mvp', voterId: 'fan', nomineeId: 'p1' }));
    await assertFails(setDoc(doc(db('captain'), 'games/g1/votes/fan_mvp'), { gameId: 'g1', categoryId: 'mvp', voterId: 'p1', nomineeId: 'p2' }));
  });

  it('drops the player link for someone moved off the team', async () => {
    await seed((fs) => setDoc(doc(fs, 'members/benched'), { role: 'fan', playerId: 'p2' }));
    await assertFails(vote('benched', 'p2', 'p1'));
    await assertSucceeds(vote('benched', 'benched', 'p2'));
  });

  it('lets voters remove their own vote and the team remove any', async () => {
    await seed(async (fs) => {
      await setDoc(doc(fs, 'games/g1/votes/fan_mvp'), { gameId: 'g1', categoryId: 'mvp', voterId: 'fan', nomineeId: 'p1' });
      await setDoc(doc(fs, 'games/g1/votes/other_mvp'), { gameId: 'g1', categoryId: 'mvp', voterId: 'other', nomineeId: 'p1' });
    });
    await assertFails(deleteDoc(doc(db('fan'), 'games/g1/votes/other_mvp')));
    await assertSucceeds(deleteDoc(doc(db('fan'), 'games/g1/votes/fan_mvp')));
    await assertSucceeds(deleteDoc(doc(db('captain'), 'games/g1/votes/other_mvp')));
  });
});
