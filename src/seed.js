import { arrayUnion, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from './firebase.js';

// Upcoming games from the league's official schedule. Each one is added once,
// the first time a team member opens the app; its id is then remembered in
// config/public.seeded, so editing or deleting the game later sticks.
const SCHEDULE = [
  { id: 'im-2026-11-04', date: '2026-11-04', time: '18:30', opponent: 'Insert Name Here', location: 'IMSB Court 4b' },
  { id: 'im-2026-11-11', date: '2026-11-11', time: '18:30', opponent: "average height 5'1", location: 'IMSB Court 4a' },
];
const TEAM_NAME = 'John Wall';

let done = false;

// Waits until the server (not the offline cache) has confirmed what's already
// there, then fills in anything missing: the schedule, the team name and the
// default MVP award.
export function seedOnce(state) {
  if (done || !state.teamSynced || state.member?.role !== 'team') return;
  done = true;

  const seeded = new Set(state.team?.seeded || []);
  const takenDates = new Set(state.games.map((g) => g.date));
  const fresh = SCHEDULE.filter((g) => !seeded.has(g.id));
  const toAdd = fresh.filter((g) => !takenDates.has(g.date)); // don't duplicate a game someone already entered
  const needsName = !state.team?.teamName;
  const needsMvp = !state.categories.some((c) => c.id === 'mvp');
  if (!fresh.length && !needsName && !needsMvp) return;

  const batch = writeBatch(db);
  for (const { id, ...game } of toAdd) {
    batch.set(doc(db, 'games', id), {
      status: 'scheduled',
      ...game,
      teamScore: null,
      opponentScore: null,
      notes: '',
      createdAt: serverTimestamp(),
    });
  }
  const pub = {};
  if (needsName) pub.teamName = TEAM_NAME;
  if (fresh.length) pub.seeded = arrayUnion(...fresh.map((g) => g.id));
  if (Object.keys(pub).length) batch.set(doc(db, 'config', 'public'), pub, { merge: true });
  if (needsMvp) batch.set(doc(db, 'awardCategories', 'mvp'), { name: 'MVP', isDefault: true });
  batch.commit().catch((err) => console.warn('First-run setup failed', err));
}
