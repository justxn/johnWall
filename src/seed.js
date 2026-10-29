import { arrayUnion, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from './firebase.js';
import { normName } from './util.js';

// Things added once, the first time a team member opens the app. Each id is
// then remembered in config/public.seeded, so editing or deleting it later sticks.

// Upcoming games from the league's official schedule.
const SCHEDULE = [
  { id: 'im-2026-11-04', date: '2026-11-04', time: '18:30', opponent: 'Insert Name Here', location: 'IMSB Court 4b' },
  { id: 'im-2026-11-11', date: '2026-11-11', time: '18:30', opponent: "average height 5'1", location: 'IMSB Court 4a' },
];
// New teammates for the roster.
const PLAYERS = ['Clyde', 'Kotaro', 'Walter'].map((name) => ({ id: `seed-${normName(name)}`, name }));
const TEAM_NAME = 'John Wall';

let done = false;

// Waits until the server (not the offline cache) has confirmed what's already
// there, then fills in anything missing: the schedule, the players, the team
// name and the default MVP award.
export function seedOnce(state, onTeam) {
  if (done || !state.teamSynced || !onTeam) return;
  done = true;

  const seeded = new Set(state.team?.seeded || []);
  const takenDates = new Set(state.games.map((g) => g.date));
  const takenNames = new Set(state.players.map((p) => normName(p.name)));
  const freshGames = SCHEDULE.filter((g) => !seeded.has(g.id));
  const freshPlayers = PLAYERS.filter((p) => !seeded.has(p.id));
  const needsName = !state.team?.teamName;
  const needsMvp = !state.categories.some((c) => c.id === 'mvp');
  if (!freshGames.length && !freshPlayers.length && !needsName && !needsMvp) return;

  const batch = writeBatch(db);
  // Skip anything someone already entered by hand.
  for (const { id, ...game } of freshGames.filter((g) => !takenDates.has(g.date))) {
    batch.set(doc(db, 'games', id), {
      status: 'scheduled',
      ...game,
      teamScore: null,
      opponentScore: null,
      notes: '',
      createdAt: serverTimestamp(),
    });
  }
  for (const { id, name } of freshPlayers.filter((p) => !takenNames.has(normName(p.name)))) {
    batch.set(doc(db, 'players', id), { name, active: true, createdAt: serverTimestamp() });
  }
  const pub = {};
  if (needsName) pub.teamName = TEAM_NAME;
  const freshIds = [...freshGames, ...freshPlayers].map((x) => x.id);
  if (freshIds.length) pub.seeded = arrayUnion(...freshIds);
  if (Object.keys(pub).length) batch.set(doc(db, 'config', 'public'), pub, { merge: true });
  if (needsMvp) batch.set(doc(db, 'awardCategories', 'mvp'), { name: 'MVP', isDefault: true });
  batch.commit().catch((err) => console.warn('First-run setup failed', err));
}
