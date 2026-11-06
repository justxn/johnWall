// The News tab's feed, in the spirit of NBA 2K's news ticker. Nothing here is
// stored: every headline and "simulated" comment is worked out from the games,
// stats, awards and injuries each time, and picked by hashing the item's id, so
// everyone sees the same feed and it only changes when the data does.
import { tally, winners } from './awards.js';
import { byDateAsc, finals, isFinal, resultOf, statusOf, streak } from './stats.js';
import { plural } from './util.js';

export const MAX_COMMENT = 140;
const RECENT_GAMES = 8;

// --- Deterministic picking ----------------------------------------------------

// FNV-1a, enough to spread ids over a list of templates.
export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const pick = (list, seed) => list[hash(seed) % list.length];
// Several different picks from one list, no repeats.
function pickN(list, n, seed) {
  const pool = [...list];
  const out = [];
  for (let i = 0; i < n && pool.length; i++) out.push(pool.splice(hash(`${seed}:${i}`) % pool.length, 1)[0]);
  return out;
}
export const fill = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));

// --- Template banks -----------------------------------------------------------
// {name} is the player in the headline, {opp} the opponent, {n} a number, {team}
// the team's name, {other} another player.

const HEADLINES = {
  win: [
    'BREAKING: {team} beat {opp} {score}, witnesses say "it was fine"',
    '{team} send {opp} home with a {score} loss and a story to tell',
    '{opp} left wondering what happened after {score} defeat',
  ],
  blowout: [
    '{team} DESTROY {opp} {score}, league asks for a recount',
    '{opp} reportedly still running back on defense after {score} blowout',
    'Mercy rule not in effect, {team} win {score} anyway',
  ],
  clutch: [
    '{team} survive {opp} {score} in a game that took years off everyone\'s lives',
    'Heart attack special: {team} edge {opp} {score}',
    '{team} squeak past {opp} {score}; sources say nobody sat down',
  ],
  loss: [
    '{opp} hand {team} a {score} loss; film session already scheduled',
    '{team} fall {score} to {opp}, blame the rims',
    '{team} drop one to {opp}, {score}. The group chat is quiet',
  ],
  rout: [
    '{opp} {score} {team}: please do not read the box score',
    '{team} get cooked {score} by {opp}, officials sorry for your loss',
  ],
  heavy: [
    '{name} drops {n} on {opp}, says "that\'s just a Tuesday"',
    '{name} goes for {n}, nets file missing-persons report',
    '{name} scores {n} against {opp}; defenders seen filing complaint',
  ],
  light: [
    '{name} leads {team} with {n} against {opp}, nobody argued',
    '{name} tops the scoring column with {n}, humbly accepts all credit',
  ],
  highCareer: [
    'CAREER NIGHT: {name} puts up {n} points, a personal best',
    '{name} sets a new career high of {n} and wants everyone to know',
  ],
  turnovers: [
    '{name} turns it over {n} times, ball is "seeking new ownership"',
    '{name} gifts {opp} {n} turnovers, deserves a thank-you card',
    '{name} had {n} giveaways. Santa came early',
  ],
  bricks: [
    '{name} shoots {made}-{att}, rim files restraining order',
    '{name} goes {made} for {att}; hoop reportedly "feeling safe"',
    'Brick report: {name} {made}-{att} from the field',
  ],
  award: [
    '{name} takes home {award}, speech lasts longer than the game',
    '{award} goes to {name}; ballot-stuffing allegations not yet confirmed',
    '{name} wins {award}, immediately rearranges trophy shelf',
  ],
  streakW: [
    '{team} have won {n} straight and are insufferable about it',
    '{n} wins in a row: {team} demand a parade',
  ],
  streakL: [
    '{team} have lost {n} straight; "it\'s a rebuilding year" has entered the chat',
    '{n} losses in a row. {team} blame the schedule, the refs, the sun',
  ],
  injury: [
    '{name} is {status}{note}. Please stretch, people',
    'Injury report: {name} {status}{note}; trainer says "told you so"',
  ],
  upcoming: [
    '{team} vs {opp}: experts predict someone will score',
    'Scouting report: {opp} "looks like a team". {team} unfazed',
  ],
};

const BODIES = {
  win: ['Final: {team} {ts}, {opp} {os}.'],
  loss: ['Final: {team} {ts}, {opp} {os}.'],
  heavy: ['Final: {team} {ts}, {opp} {os}. {name} shot it like the rim owed them money.'],
  light: ['Final: {team} {ts}, {opp} {os}.'],
  highCareer: ['Previous best: {prev}. {name} says the next one is "already in the works".'],
  turnovers: ['The "assist to turnover ratio" is just a number, {name} reminds reporters.'],
  bricks: ['Shooting coaches have been notified.'],
  award: ['Voters were reportedly "emotionally compromised".'],
  streak: ['Current record: {rec}.'],
  injury: ['The trainer has been notified and is "not surprised."'],
  upcoming: ['Tip-off {when}.'],
};

// Comments by mood. {name} is the subject; {other} another player or fan.
const COMMENTS = {
  hype: [
    'LET HIM COOK 🔥',
    '{name} for MVP, no debate',
    'I said it in week one and I\'ll say it again: {name} is him',
    'Somebody check {name}\'s shoes for rocket boosters',
    'Put {name} in the Hall of Fame, the intramural one at least',
    'this is why I pay for the league fee',
    'cold. blooded.',
    'Tell {name} to leave some for the rest of us',
    'Pay the man. Pay him in orange slices.',
  ],
  roast: [
    'bro i have seen better from a toddler with a nerf hoop',
    'Not {name} trying to cook and burning the whole kitchen down 💀',
    'we gotta tell {name} the ball goes IN the hoop',
    'Sell the team. Sell {name} first.',
    '{name} when the cameras are off: 🤷',
    'Respectfully, no. 🚫',
    'My grandma has a better jumper and she\'s a lamp',
    'Honestly? Embarrassing. Love you though {name}',
    'Is this the game or the warmup, I can\'t tell',
  ],
  neutral: [
    'Anyone know if they\'re playing next week?',
    'ref was blind but ok',
    'Who has the orange slices this time?',
    'meanwhile, the court is still wet from last game',
    'imagine caring this much about intramural. (I do.)',
    'This feed is the best thing about this league',
    'who parked in the fire lane again',
    'Great game by everybody. Nobody tell them I said that',
  ],
  injury: [
    'Walk it off.',
    'get well soon, we need you to be mediocre again',
    'Ice, rest, and stop going for the dunk you can\'t do',
    'Tell {name} to do their stretches. We all know they skip them',
  ],
  trade: [
    '{other} could never 😤',
    '{other} said this wouldn\'t happen. {other} was wrong',
    'Would {other} have done this? Genuinely asking',
  ],
};

// Fake commenters, plus the real players (see commenters()).
const HANDLES = [
  'CourtsideCarl', 'xX_Bricklayer_Xx', 'SectionBSteve', 'DunkOrNothing', 'RefIsBlind42',
  'OrangeSliceDan', 'TheRealGM', 'HoopsMom', 'AirballAndy', 'Dribble_Dad',
  'BenchWarmerBen', 'FromDowntownDave', 'JumboTronJill', 'TheSixthMan', 'ShotClockSam',
  'PickupPhil', 'ZoneDefenseZoe', 'ChalkyHands', 'LastRowLarry', 'AnonymousFan',
];

const MOODS = {
  good: ['hype', 'hype', 'roast'],
  bad: ['roast', 'roast', 'neutral', 'hype'],
  mixed: ['neutral', 'roast', 'hype'],
  injury: ['injury', 'injury', 'neutral'],
};

// --- Building simulated comments ----------------------------------------------

// The commenters: made-up fans, plus the real players now and then.
function commenters(players, subjectId, seed, n) {
  const others = players.filter((p) => p.id !== subjectId && p.active !== false);
  const picks = [];
  for (let i = 0; i < n; i++) {
    // Roughly one comment in three is a teammate chiming in.
    const teammate = others.length && hash(`${seed}:who:${i}`) % 3 === 0;
    picks.push(teammate ? { name: pick(others, `${seed}:t:${i}`).name, player: true } : { name: pick(HANDLES, `${seed}:h:${i}`), player: false });
  }
  // The same person shouldn't comment twice on one story.
  const seen = new Set();
  return picks.map((c, i) => {
    let who = c;
    for (let k = 1; seen.has(who.name) && k < HANDLES.length; k++) who = { name: HANDLES[(hash(`${seed}:u:${i}`) + k) % HANDLES.length], player: false };
    seen.add(who.name);
    return who;
  });
}

function simComments(item, players, mood, subject) {
  const n = 2 + (hash(`${item.id}:count`) % 3); // 2 to 4
  const others = players.filter((p) => p.id !== item.playerId && p.active !== false);
  const people = commenters(players, item.playerId, item.id, n);
  const used = new Set();
  return people.map((who, i) => {
    const m = pick(MOODS[mood], `${item.id}:mood:${i}`);
    const bank = m === 'roast' && !subject ? COMMENTS.neutral : COMMENTS[m];
    let text = pick(bank, `${item.id}:c:${i}`);
    for (let k = 1; used.has(text) && k < bank.length; k++) text = bank[(bank.indexOf(text) + 1) % bank.length];
    used.add(text);
    const other = others.length ? pick(others, `${item.id}:o:${i}`).name : 'somebody';
    return { id: `${item.id}:sim:${i}`, author: who.name, isPlayer: who.player, text: fill(text, { name: subject || 'the team', other }), sim: true };
  });
}

// --- Items --------------------------------------------------------------------

const when = (game) => {
  const t = Date.parse(`${game.date || ''}T${game.time || '12:00'}`);
  return Number.isNaN(t) ? 0 : t;
};

const score = (g) => `${g.teamScore}-${g.opponentScore}`;

function make(state, { id, kind, ts, icon, bank, vars, body = '', playerId = null, mood, link = null }) {
  const player = playerId ? state.players.find((p) => p.id === playerId) : null;
  const all = { team: state.teamName, name: player?.name ?? '', ...vars };
  const item = {
    id,
    kind,
    ts,
    icon,
    playerId,
    link,
    headline: fill(pick(HEADLINES[bank], `${id}:h`), all),
    body: body ? fill(pick(BODIES[body[0]] ?? [''], `${id}:b`), { ...all, ...body[1] }) : '',
  };
  item.sim = simComments(item, state.players, mood, player?.name);
  return item;
}

// The feed, newest first. `state` needs players, games, stats, votes, categories,
// injuries and teamName; `now` is only used to stamp undated items.
export function buildFeed(input, now = Date.now()) {
  const state = { teamName: 'We', players: [], games: [], stats: [], votes: [], categories: [], injuries: [], ...input };
  const items = [];
  const lines = (g) => state.stats.filter((s) => s.gameId === g.id);
  const done = finals(state.games);
  const order = [...state.games].filter(isFinal).sort(byDateAsc);

  for (const game of done.slice(0, RECENT_GAMES)) {
    if (game.teamScore == null || game.opponentScore == null) continue;
    const ts = when(game);
    const opp = game.opponent || 'the other team';
    const margin = game.teamScore - game.opponentScore;
    const won = resultOf(game) === 'W';
    const vars = { opp, score: score(game), ts: game.teamScore, os: game.opponentScore };

    let bank;
    if (won) bank = margin >= 15 ? 'blowout' : margin <= 3 ? 'clutch' : 'win';
    else bank = margin <= -15 ? 'rout' : 'loss';
    items.push(make(state, { id: `recap:${game.id}`, kind: 'recap', ts: ts + 5, icon: won ? '🏆' : '😬', bank, vars, body: [won ? 'win' : 'loss'], mood: won ? 'good' : 'bad', link: `#/games/${game.id}` }));

    const rows = lines(game);
    const scored = rows.filter((s) => s.points != null).sort((a, b) => b.points - a.points);
    const top = scored[0];
    if (top && top.points > 0) {
      const prior = order
        .slice(0, order.findIndex((g) => g.id === game.id))
        .map((g) => state.stats.find((s) => s.gameId === g.id && s.playerId === top.playerId)?.points)
        .filter((p) => p != null);
      const best = prior.length >= 2 ? Math.max(...prior) : null;
      if (best != null && top.points > best) {
        items.push(make(state, { id: `high:${game.id}:${top.playerId}`, kind: 'high', ts: ts + 4, icon: '📈', bank: 'highCareer', vars: { ...vars, n: top.points }, body: ['highCareer', { prev: best }], playerId: top.playerId, mood: 'good', link: `#/players/${top.playerId}` }));
      } else {
        items.push(make(state, { id: `top:${game.id}:${top.playerId}`, kind: 'top', ts: ts + 4, icon: '🔥', bank: top.points >= 15 ? 'heavy' : 'light', vars: { ...vars, n: top.points }, body: [top.points >= 15 ? 'heavy' : 'light'], playerId: top.playerId, mood: top.points >= 15 ? 'good' : 'mixed', link: `#/players/${top.playerId}` }));
      }
    }

    const tov = rows.filter((s) => s.turnovers != null).sort((a, b) => b.turnovers - a.turnovers)[0];
    if (tov && tov.turnovers >= 3) {
      items.push(make(state, { id: `tov:${game.id}:${tov.playerId}`, kind: 'shame', ts: ts + 3, icon: '🗑️', bank: 'turnovers', vars: { ...vars, n: tov.turnovers }, body: ['turnovers'], playerId: tov.playerId, mood: 'bad', link: `#/players/${tov.playerId}` }));
    }

    const cold = rows
      .filter((s) => s.fga != null && s.fgm != null && s.fga >= 5 && s.fgm / s.fga <= 0.25)
      .sort((a, b) => b.fga - a.fga)[0];
    if (cold) {
      items.push(make(state, { id: `brick:${game.id}:${cold.playerId}`, kind: 'shame', ts: ts + 2, icon: '🧱', bank: 'bricks', vars: { ...vars, made: cold.fgm, att: cold.fga }, body: ['bricks'], playerId: cold.playerId, mood: 'bad', link: `#/players/${cold.playerId}` }));
    }

    for (const cat of state.categories) {
      for (const pid of winners(tally(state.votes, game.id, cat.id))) {
        items.push(make(state, { id: `award:${game.id}:${cat.id}:${pid}`, kind: 'award', ts: ts + 1, icon: '🏅', bank: 'award', vars: { ...vars, award: cat.name }, body: ['award'], playerId: pid, mood: 'good', link: '#/awards' }));
      }
    }
  }

  const run = streak(state.games);
  if (run && run.count >= 3 && done[0]) {
    const w = run.type === 'W';
    items.push(make(state, { id: `streak:${run.type}${run.count}`, kind: 'streak', ts: when(done[0]) + 6, icon: w ? '🔥' : '🥶', bank: w ? 'streakW' : 'streakL', vars: { n: run.count }, body: ['streak', { rec: plural(run.count, w ? 'win' : 'loss') }], mood: w ? 'good' : 'bad' }));
  }

  for (const inj of state.injuries.filter((i) => !i.clearedOn)) {
    const label = { out: 'OUT', doubtful: 'doubtful', questionable: 'questionable', probable: 'probable' }[inj.status] ?? inj.status ?? 'hurt';
    const ts = Date.parse(inj.since || '') || now;
    items.push(make(state, { id: `injury:${inj.id}`, kind: 'injury', ts, icon: '🩹', bank: 'injury', vars: { status: label, note: inj.note ? ` (${inj.note})` : '' }, body: ['injury'], playerId: inj.playerId, mood: 'injury', link: '#/injuries' }));
  }

  const next = state.games.filter((g) => statusOf(g) === 'scheduled').sort(byDateAsc)[0];
  if (next) {
    items.push(make(state, { id: `next:${next.id}`, kind: 'preview', ts: when(next) - 1, icon: '📅', bank: 'upcoming', vars: { opp: next.opponent || 'TBD' }, body: ['upcoming', { when: next.time ? `${next.date} at ${next.time}` : next.date }], mood: 'mixed', link: `#/games/${next.id}` }));
  }

  // Nothing to report yet? Say so, in character.
  if (!items.length) {
    items.push({
      id: 'welcome', kind: 'welcome', ts: now, icon: '📰', playerId: null, link: null,
      headline: 'BREAKING: league has a news desk now, nothing has happened yet',
      body: 'Finish a game and the headlines start rolling in. Until then, the comments are open.',
      sim: [],
    });
  }

  return items.sort((a, b) => b.ts - a.ts || a.id.localeCompare(b.id));
}

// --- Real comments ------------------------------------------------------------

// A comment people can post: trimmed, not empty, not too long.
export function cleanComment(text) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return { error: 'Write something first' };
  if (t.length > MAX_COMMENT) return { error: `Keep it under ${MAX_COMMENT} characters` };
  return { text: t };
}

// A made-up but stable name for someone commenting without a name.
export const anonName = (key) => `Fan ${String(hash(String(key))).slice(-4)}`;

// Real comments for one news item, oldest first.
export const commentsFor = (comments, itemId) =>
  comments.filter((c) => c.itemId === itemId).sort((a, b) => (a.createdAt ?? Infinity) - (b.createdAt ?? Infinity));

// For the tab bar badge and "x comments" labels.
export const commentCount = (item, comments) => item.sim.length + commentsFor(comments, item.id).length;
