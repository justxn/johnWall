// The News tab's feed, in the spirit of NBA 2K's news ticker. Nothing here is
// stored: every story and "simulated" comment is worked out from the games,
// stats, votes, injuries and the book each time, and picked by hashing the
// story's id, so everyone sees the same feed and it only changes when the data
// does. Story ids never change, so real comments stay attached to their story.
import { tally, winners } from './awards.js';
import { TIERS, badgeProgress } from './badges.js';
import { PROP_LABELS, PROP_NOUNS, grade } from './book.js';
import {
  AVG_LABELS,
  byDateAsc,
  finalStats,
  finals,
  fmtAvg,
  headToHead,
  isFinal,
  leaders,
  lineText,
  liveGames,
  record,
  resultOf,
  streak,
  upcoming,
} from './stats.js';
import { andList, fmtDate, fmtTime, plural, todayISO } from './util.js';

export const MAX_COMMENT = 140;
const RECENT_GAMES = 8;
const DAY = 864e5;

// What each kind of story is called and which filter it's under.
export const KINDS = {
  recap: { kicker: 'Final', section: 'games' },
  streak: { kicker: 'Streak watch', section: 'games' },
  preview: { kicker: 'Preview', section: 'games' },
  top: { kicker: 'Top scorer', section: 'players' },
  high: { kicker: 'Career night', section: 'players' },
  standout: { kicker: 'Standout', section: 'players' },
  milestone: { kicker: 'Milestone', section: 'players' },
  shame: { kicker: 'Rough night', section: 'players' },
  award: { kicker: 'Award', section: 'awards' },
  badge: { kicker: 'Badge unlocked', section: 'awards' },
  injury: { kicker: 'Injury report', section: 'injuries' },
  book: { kicker: 'The book', section: 'book' },
  lines: { kicker: 'Lines are up', section: 'book' },
  welcome: { kicker: 'News desk', section: 'games' },
};

export const SECTIONS = [
  { id: 'all', label: 'All' },
  { id: 'games', label: 'Games' },
  { id: 'players', label: 'Players' },
  { id: 'awards', label: 'Awards' },
  { id: 'injuries', label: 'Injuries' },
  { id: 'book', label: 'Book' },
];
export const sectionOf = (item) => KINDS[item.kind]?.section ?? 'games';

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
export const fill = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));

// --- Headlines ------------------------------------------------------------------
// {name} is the player in the story, {opp} the opponent, {n} a number, {team}
// the team's name. Adding a line to an existing list can change which one an
// old story shows, so new lines go in new lists.

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
  triple: [
    'TRIPLE-DOUBLE: {name} does a bit of everything against {opp}',
    '{name} fills the whole box score against {opp}; statisticians need a minute',
  ],
  double: [
    'Double-double alert: {name} gets it done against {opp}',
    '{name} posts a double-double, asks why nobody\'s talking about it',
  ],
  lockdown: [
    '{name} locks up {opp} with {stocks}',
    'No-fly zone: {name} racks up {n} stocks against {opp}',
  ],
  dimes: [
    '{name} hands out {n} assists, teammates send thank-you notes',
    'Point god {name} dishes {n} dimes against {opp}',
  ],
  boards: [
    '{name} grabs {n} rebounds; the rim is now private property',
    '{name} cleans the glass for {n} boards against {opp}',
  ],
  milestone: [
    '{name} hits {n} career points',
    'MILESTONE: {name} reaches {n} points, demands a banner',
  ],
  badge: [
    '{name} unlocks {tier} {badge}',
    'Badge upgrade: {name} is now {tier} {badge}',
    '{name} earns {tier} {badge}; ratings adjuster on line one',
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
  cleared: [
    '{name} is cleared to play and "never felt better"',
    'Good news: {name} is back{was}',
  ],
  upcoming: [
    '{team} vs {opp}: experts predict someone will score',
    'Scouting report: {opp} "looks like a team". {team} unfazed',
  ],
  lines: [
    'Lines are up for {opp}: {name} o/u {line} {stat}',
    'The book sets {name} at {line} {stat} against {opp}. Hammer the over?',
  ],
  bookWin: [
    '{bettor} cashes {n} coins on the {opp} game',
    'Somebody check on the book: {bettor} walks away up {n}',
  ],
  bookHouse: [
    'The house wins: bettors drop {n} coins on the {opp} game',
    'Book report: the {opp} game was a bloodbath for bettors',
  ],
};

// --- Simulated comments ---------------------------------------------------------
// By mood. {name} is the story's subject; {other} another player.
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
  book: [
    'I\'m never betting the under again',
    'the house always wins 😤',
    'who is setting these lines???',
    '{name} with the inside info, very suspicious',
    'tailing {name} next week 💰',
    'Lock of the century. (It was not.)',
    'my coins. my beautiful coins.',
  ],
  trade: [
    '{other} could never 😤',
    '{other} said this wouldn\'t happen. {other} was wrong',
    'Would {other} have done this? Genuinely asking',
  ],
};

// Made-up commenters, plus the real players (see commenters()).
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
  book: ['book', 'book', 'neutral'],
};

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

// --- Building stories -------------------------------------------------------------

// Local time in ms of a stored date ('YYYY-MM-DD') and time ('HH:MM'); 0 with no date.
function at(date, time) {
  if (!date) return 0;
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = (time || '12:00').split(':').map(Number);
  const t = new Date(y, m - 1, d, hh, mm).getTime();
  return Number.isNaN(t) ? 0 : t;
}
const gameTime = (game) => at(game.date, game.time);

// The data the stories come from, with a few lookups.
function context(input) {
  const s = { teamName: 'We', players: [], games: [], stats: [], votes: [], categories: [], injuries: [], bets: [], lines: [], ...input };
  const order = s.games.filter(isFinal).sort(byDateAsc); // oldest first
  const index = new Map(order.map((g, i) => [g.id, i]));
  const byId = new Map(s.players.map((p) => [p.id, p]));
  const cache = new Map();
  // Stat lines from the first i + 1 finished games.
  const through = (i) => {
    if (!cache.has(i)) cache.set(i, s.stats.filter((r) => (index.get(r.gameId) ?? Infinity) <= i));
    return cache.get(i);
  };
  const player = (id) => byId.get(id) ?? null;
  return { ...s, order, index, through, player, name: (id) => player(id)?.name ?? 'Somebody' };
}

// One story. `bank` picks the headline; `body` is text with {slots}, or a list
// to pick from. `subject` is who the simulated comments are about.
function story(ctx, spec) {
  const { id, kind, bank, vars = {}, body = '', playerId = null, subject, mood, ...rest } = spec;
  const player = playerId ? ctx.player(playerId) : null;
  const all = { team: ctx.teamName, name: player?.name ?? '', ...vars };
  const item = {
    id,
    kind,
    kicker: KINDS[kind].kicker,
    tone: 'accent',
    icon: '📰',
    link: null,
    linkLabel: '',
    art: null,
    ...rest,
    playerId,
    headline: fill(pick(HEADLINES[bank], `${id}:h`), all),
    body: fill(Array.isArray(body) ? pick(body, `${id}:b`) : body, all),
  };
  item.sim = simComments(item, ctx.players, mood, subject ?? player?.name);
  return item;
}

// "Clyde had 11 points and 4 rebounds. Kotaro added 5 assists."
function recapBody(ctx, game, rows) {
  const best = (k) => rows.filter((r) => r[k] > 0).sort((a, b) => b[k] - a[k] || a.playerId.localeCompare(b.playerId))[0];
  const by = new Map();
  for (const [k, noun] of [['points', 'point'], ['rebounds', 'rebound'], ['assists', 'assist']]) {
    const r = best(k);
    if (r) by.set(r.playerId, [...(by.get(r.playerId) ?? []), plural(r[k], noun)]);
  }
  if (!by.size) return `Final: {team} ${game.teamScore}, {opp} ${game.opponentScore}.`;
  const verbs = ['had', 'added', 'chipped in'];
  return [...by].map(([pid, parts], i) => `${ctx.name(pid)} ${verbs[i]} ${andList(parts)}.`).join(' ');
}

// The best all-round night that isn't just scoring: a double-double (or
// better) from anyone, then defense, passing and rebounding from someone other
// than the top scorer, who has a story already.
const TENS = ['points', 'rebounds', 'assists', 'steals', 'blocks'];
function standout(rows, topId) {
  const found = [];
  for (const r of rows) {
    const tens = TENS.filter((k) => r[k] >= 10).length;
    if (tens >= 2) {
      const triple = tens >= 3;
      found.push({ r, rank: triple ? 0 : 1, score: tens, bank: triple ? 'triple' : 'double', icon: '📊', vars: {}, art: { type: 'stat', value: triple ? 'TD' : 'DD', label: triple ? 'Triple-double' : 'Double-double' } });
    }
    if (r.playerId === topId) continue;
    const stocks = (r.steals ?? 0) + (r.blocks ?? 0);
    if (stocks >= 4) {
      const parts = [r.steals ? plural(r.steals, 'steal') : '', r.blocks ? plural(r.blocks, 'block') : ''].filter(Boolean);
      found.push({ r, rank: 2, score: stocks, bank: 'lockdown', icon: '🔒', vars: { n: stocks, stocks: andList(parts) }, art: { type: 'stat', value: stocks, label: 'STL+BLK' } });
    }
    if (r.assists >= 5) found.push({ r, rank: 3, score: r.assists, bank: 'dimes', icon: '🎁', vars: { n: r.assists }, art: { type: 'stat', value: r.assists, label: 'AST' } });
    if (r.rebounds >= 8) found.push({ r, rank: 4, score: r.rebounds, bank: 'boards', icon: '🧽', vars: { n: r.rebounds }, art: { type: 'stat', value: r.rebounds, label: 'REB' } });
  }
  return found.sort((a, b) => a.rank - b.rank || b.score - a.score || a.r.playerId.localeCompare(b.r.playerId))[0] ?? null;
}

// Badge tiers players reached in game i, best first.
function badgeUps(ctx, i, rows) {
  const ups = [];
  for (const pid of new Set(rows.map((r) => r.playerId))) {
    const was = badgeProgress(pid, ctx.through(i - 1));
    badgeProgress(pid, ctx.through(i)).forEach((p, k) => {
      if (p.tier > was[k].tier) ups.push({ pid, badge: p.badge, tier: p.tier, order: k });
    });
  }
  return ups.sort((a, b) => b.tier - a.tier || a.order - b.order || ctx.name(a.pid).localeCompare(ctx.name(b.pid)));
}

// Career points marks; the biggest one passed in game i, or null.
const MILESTONES = [25, 50, 75, 100, 150, 200, 250, 300, 400, 500, 750, 1000];
function milestone(ctx, i, pid) {
  const total = (rows) => rows.reduce((n, r) => n + (r.playerId === pid && r.points != null ? r.points : 0), 0);
  const was = total(ctx.through(i - 1));
  const now = total(ctx.through(i));
  return MILESTONES.filter((m) => was < m && now >= m).at(-1) ?? null;
}

// Everything that came out of one finished game. The small offsets on `ts`
// keep a game's stories in this order.
function gameStories(ctx, game) {
  const t = gameTime(game);
  const i = ctx.index.get(game.id);
  const rows = ctx.stats.filter((s) => s.gameId === game.id);
  const opp = game.opponent || 'the other team';
  const won = resultOf(game) === 'W';
  const margin = game.teamScore - game.opponentScore;
  const out = [];
  const add = (spec) => out.push(story(ctx, { date: game.date, mood: 'good', ...spec, vars: { opp, score: `${game.teamScore}-${game.opponentScore}`, ...spec.vars } }));
  const playerLink = (pid) => ({ playerId: pid, link: `#/players/${pid}`, linkLabel: 'Player page' });

  add({
    id: `recap:${game.id}`, kind: 'recap', ts: t + 10, icon: won ? '🏆' : '😬', tone: won ? 'win' : 'loss',
    kicker: won ? 'Final · W' : 'Final · L',
    bank: won ? (margin >= 15 ? 'blowout' : margin <= 3 ? 'clutch' : 'win') : margin <= -15 ? 'rout' : 'loss',
    body: recapBody(ctx, game, rows), mood: won ? 'good' : 'bad', link: `#/games/${game.id}`, linkLabel: 'Box score',
    art: { type: 'score', us: game.teamScore, them: game.opponentScore, opp, won },
  });

  const top = rows.filter((r) => r.points != null).sort((a, b) => b.points - a.points || a.playerId.localeCompare(b.playerId))[0];
  if (top?.points > 0) {
    const prior = ctx.through(i - 1).filter((r) => r.playerId === top.playerId && r.points != null).map((r) => r.points);
    const best = prior.length >= 2 ? Math.max(...prior) : null;
    const career = best != null && top.points > best;
    const heavy = top.points >= 10;
    add({
      id: `${career ? 'high' : 'top'}:${game.id}:${top.playerId}`, kind: career ? 'high' : 'top', ts: t + 8,
      icon: career ? '📈' : '🔥', bank: career ? 'highCareer' : heavy ? 'heavy' : 'light', vars: { n: top.points },
      body: `${lineText(top)}.${career ? ` Previous best: ${best}.` : ''}`, mood: career || heavy ? 'good' : 'mixed',
      art: { type: 'stat', value: top.points, label: 'PTS' }, ...playerLink(top.playerId),
    });
  }

  const star = standout(rows, top?.playerId);
  if (star) {
    add({ id: `standout:${game.id}:${star.r.playerId}`, kind: 'standout', ts: t + 7, icon: star.icon, bank: star.bank, vars: star.vars, body: `${lineText(star.r)}.`, art: star.art, ...playerLink(star.r.playerId) });
  }

  for (const cat of ctx.categories) {
    const counts = tally(ctx.votes, game.id, cat.id);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    for (const pid of winners(counts)) {
      add({
        id: `award:${game.id}:${cat.id}:${pid}`, kind: 'award', ts: t + 6, icon: cat.isDefault ? '🏆' : '🏅', tone: 'gold', kicker: cat.name,
        bank: 'award', vars: { award: cat.name }, playerId: pid, body: `${counts[pid]} of ${plural(total, 'vote')}. Voters were reportedly "emotionally compromised".`,
        link: `#/games/${game.id}`, linkLabel: 'See the votes',
      });
    }
  }

  const ups = badgeUps(ctx, i, rows);
  if (ups.length) {
    const [first, ...more] = ups;
    const also = more.slice(0, 3).map((u) => `${ctx.name(u.pid)} (${TIERS[u.tier]} ${u.badge.name})`);
    add({
      id: `badge:${game.id}`, kind: 'badge', ts: t + 5, icon: first.badge.icon, tone: 'gold', bank: 'badge',
      vars: { tier: TIERS[first.tier], badge: first.badge.name },
      body: more.length ? `Also leveling up: ${more.length > 3 ? `${also.join(', ')} and ${more.length - 3} more` : andList(also)}.` : `${first.badge.about}.`,
      art: { type: 'badge', icon: first.badge.icon, tier: first.tier }, ...playerLink(first.pid),
    });
  }

  for (const r of rows) {
    const mark = milestone(ctx, i, r.playerId);
    if (mark) {
      add({ id: `milestone:${game.id}:${r.playerId}`, kind: 'milestone', ts: t + 4, icon: '🎉', bank: 'milestone', vars: { n: mark }, body: `Got there with ${plural(r.points, 'point')} against {opp}.`, art: { type: 'stat', value: mark, label: 'Career PTS' }, ...playerLink(r.playerId) });
    }
  }

  const book = bookResult(ctx, game, rows);
  if (book) add({ id: `book:${game.id}`, kind: 'book', ts: t + 3, tone: 'book', mood: 'book', link: '#/book', linkLabel: 'Open the book', ...book });

  const tov = rows.filter((r) => r.turnovers != null).sort((a, b) => b.turnovers - a.turnovers || a.playerId.localeCompare(b.playerId))[0];
  if (tov?.turnovers >= 3) {
    add({ id: `tov:${game.id}:${tov.playerId}`, kind: 'shame', kicker: 'Turnover watch', ts: t + 2, icon: '🗑️', tone: 'loss', bank: 'turnovers', vars: { n: tov.turnovers }, body: 'The "assist to turnover ratio" is just a number, {name} reminds reporters.', mood: 'bad', ...playerLink(tov.playerId) });
  }

  const cold = rows
    .filter((r) => r.fga != null && r.fgm != null && r.fga >= 5 && r.fgm / r.fga <= 0.25)
    .sort((a, b) => b.fga - a.fga || a.playerId.localeCompare(b.playerId))[0];
  if (cold) {
    add({ id: `brick:${game.id}:${cold.playerId}`, kind: 'shame', kicker: 'Brick report', ts: t + 1, icon: '🧱', tone: 'loss', bank: 'bricks', vars: { made: cold.fgm, att: cold.fga }, body: 'Shooting coaches have been notified.', mood: 'bad', ...playerLink(cold.playerId) });
  }

  return out;
}

// How the book did on a game: the biggest winner, or the house when nobody
// came out ahead. Null when nothing was bet (or it all pushed).
function bookResult(ctx, game, rows) {
  const bets = ctx.bets.filter((b) => b.gameId === game.id);
  if (!bets.length) return null;
  const people = new Map();
  for (const bet of bets) {
    const result = grade(bet, rows.find((r) => r.playerId === bet.playerId));
    const p = people.get(bet.bettorId) ?? { name: ctx.player(bet.bettorId)?.name ?? bet.bettorName ?? 'A fan', net: 0 };
    p.net += result === 'won' ? bet.stake : result === 'lost' ? -bet.stake : 0;
    people.set(bet.bettorId, p);
  }
  const ranked = [...people.values()].sort((a, b) => b.net - a.net || a.name.localeCompare(b.name));
  const house = -ranked.reduce((n, p) => n + p.net, 0);
  const body = `${plural(bets.length, 'bet')} settled. The house ${house >= 0 ? 'kept' : 'paid out'} ${Math.abs(house)} coins.`;
  if (ranked[0].net > 0) {
    return { icon: '💰', bank: 'bookWin', vars: { bettor: ranked[0].name, n: ranked[0].net }, subject: ranked[0].name, body, art: { type: 'stat', value: `+${ranked[0].net}`, label: 'coins' } };
  }
  if (house > 0) return { icon: '🏦', bank: 'bookHouse', vars: { n: house }, body, art: { type: 'stat', value: `+${house}`, label: 'house' } };
  return null;
}

// Before the next game: a preview and, once the book has props up, the
// featured line. They're "published" two days out (or right after the last
// game, if that's later) and stay hidden until then.
function nextGameStories(ctx, now) {
  const next = upcoming(ctx.games, todayISO(new Date(now)))[0];
  if (!next) return [];
  const last = ctx.order.at(-1);
  const ts = Math.max(last ? gameTime(last) + 20 : 0, gameTime(next) - 2 * DAY);
  if (ts > now) return [];
  const date = todayISO(new Date(ts));
  const opp = next.opponent || 'TBD';
  const when = [fmtDate(next.date), fmtTime(next.time)].filter(Boolean).join(' at ');
  const h2h = headToHead(ctx.games, next.opponent);
  const out = [story(ctx, {
    id: `next:${next.id}`, kind: 'preview', ts, date, icon: '📅', bank: 'upcoming', vars: { opp },
    body: `Tip-off ${when || 'TBD'}${next.location ? ` at ${next.location}` : ''}. ${h2h.games.length ? `${h2h.wins}–${h2h.losses} against them so far.` : 'First meeting.'}`,
    mood: 'mixed', link: `#/games/${next.id}`, linkLabel: 'Game page',
    art: { type: 'matchup', opp, when: [fmtDate(next.date), fmtTime(next.time)].filter(Boolean).join(' · ') },
  })];
  const posted = ctx.lines.filter((l) => l.gameId === next.id && !l.pulled);
  const feature = [...posted].sort((a, b) => (b.stat === 'points') - (a.stat === 'points') || b.line - a.line || a.id.localeCompare(b.id))[0];
  if (feature) {
    const line = `${feature.stat === 'plusMinus' && feature.line > 0 ? '+' : ''}${feature.line}`;
    out.push(story(ctx, {
      id: `lines:${next.id}`, kind: 'lines', ts: ts - 1, date, icon: '🎟️', tone: 'book', bank: 'lines',
      vars: { opp, line, stat: PROP_NOUNS[feature.stat] }, playerId: feature.playerId,
      body: `${plural(posted.length, 'prop')} on the board. Betting closes at tip-off.`, mood: 'book', link: '#/book', linkLabel: 'Open the book',
      art: { type: 'stat', value: line, label: `o/u ${PROP_LABELS[feature.stat]}` },
    }));
  }
  return out;
}

const STATUS = { out: 'OUT', doubtful: 'doubtful', questionable: 'questionable', probable: 'probable' };

// Who's hurt, and who came back since the oldest game in the feed.
function injuryStories(ctx, since) {
  return ctx.injuries.flatMap((inj) => {
    const label = STATUS[inj.status] ?? inj.status ?? 'hurt';
    if (!inj.clearedOn) {
      return [story(ctx, {
        id: `injury:${inj.id}`, kind: 'injury', ts: at(inj.since), date: inj.since, icon: '🩹', tone: 'warn', bank: 'injury',
        vars: { status: label, note: inj.note ? ` (${inj.note})` : '' }, playerId: inj.playerId,
        body: inj.expectedReturn ? `Expected back ${fmtDate(inj.expectedReturn)}.` : 'The trainer has been notified and is "not surprised."',
        mood: 'injury', link: '#/injuries', linkLabel: 'Injury report',
      })];
    }
    if (inj.clearedOn < since) return [];
    return [story(ctx, {
      id: `cleared:${inj.id}`, kind: 'injury', kicker: 'Back in action', ts: at(inj.clearedOn), date: inj.clearedOn, icon: '💪', tone: 'win', bank: 'cleared',
      vars: { was: inj.note ? ` from ${inj.note}` : '' }, playerId: inj.playerId,
      body: inj.since ? `Was ${label.toLowerCase()} from ${fmtDate(inj.since, { weekday: false })}.` : 'Cleared to play.',
      mood: 'good', link: `#/players/${inj.playerId}`, linkLabel: 'Player page',
    })];
  });
}

// The feed, newest first. `input` needs players, games, stats, votes,
// categories, injuries, bets, lines and teamName; `now` decides which previews
// are out yet and stamps the welcome story.
export function buildFeed(input, now = Date.now()) {
  const ctx = context(input);
  const recent = finals(ctx.games).filter((g) => g.teamScore != null && g.opponentScore != null).slice(0, RECENT_GAMES);
  const items = recent.flatMap((g) => gameStories(ctx, g));

  const run = streak(ctx.games);
  if (run?.count >= 3 && recent[0]) {
    const w = run.type === 'W';
    const { wins, losses } = record(ctx.games);
    items.push(story(ctx, {
      id: `streak:${run.type}${run.count}`, kind: 'streak', ts: gameTime(recent[0]) + 9, date: recent[0].date, icon: w ? '🔥' : '🥶', tone: w ? 'win' : 'loss',
      bank: w ? 'streakW' : 'streakL', vars: { n: run.count }, body: `Season record: ${wins}–${losses}.`, mood: w ? 'good' : 'bad',
      art: { type: 'stat', value: `${run.type}${run.count}`, label: 'Streak' },
    }));
  }

  items.push(...injuryStories(ctx, recent.at(-1)?.date ?? ''), ...nextGameStories(ctx, now));

  // Nothing to report yet? Say so, in character.
  if (!items.length) {
    items.push({
      id: 'welcome', kind: 'welcome', kicker: KINDS.welcome.kicker, tone: 'accent', ts: now, date: todayISO(new Date(now)), icon: '📰',
      playerId: null, link: null, linkLabel: '', art: null,
      headline: 'BREAKING: league has a news desk now, nothing has happened yet',
      body: 'Finish a game and the headlines start rolling in. Until then, the comments are open.',
      sim: [],
    });
  }
  return items.sort((a, b) => b.ts - a.ts || a.id.localeCompare(b.id));
}

// Quick hits for the ticker across the top of the News tab: [{ label, text }].
export function tickerItems(input, now = Date.now()) {
  const ctx = context(input);
  const out = [];
  for (const g of liveGames(ctx.games)) out.push({ label: 'Live', text: `${ctx.teamName} ${g.teamScore ?? 0}, ${g.opponent || 'Opponent'} ${g.opponentScore ?? 0}` });
  const last = finals(ctx.games).find((g) => g.teamScore != null && g.opponentScore != null);
  if (last) out.push({ label: 'Final', text: `${ctx.teamName} ${last.teamScore}, ${last.opponent || 'Opponent'} ${last.opponentScore}` });
  const next = upcoming(ctx.games, todayISO(new Date(now)))[0];
  if (next) out.push({ label: 'Next', text: `vs ${next.opponent || 'TBD'}, ${[fmtDate(next.date), fmtTime(next.time)].filter(Boolean).join(' ')}` });
  const { wins, losses } = record(ctx.games);
  const run = streak(ctx.games);
  if (wins + losses) out.push({ label: 'Record', text: `${wins}–${losses}${run?.count > 1 ? `, ${run.type}${run.count}` : ''}` });
  const done = finalStats(ctx.games, ctx.stats);
  for (const k of ['points', 'rebounds', 'assists']) {
    const top = leaders(ctx.players, done, k)[0];
    if (top) out.push({ label: AVG_LABELS[k], text: `${top.player.name} ${fmtAvg(top.value)}` });
  }
  for (const inj of ctx.injuries.filter((i) => !i.clearedOn)) {
    out.push({ label: 'Injury', text: `${ctx.name(inj.playerId)} ${(STATUS[inj.status] ?? inj.status ?? 'hurt').toLowerCase()}` });
  }
  return out;
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

// Real comments for one story, oldest first.
export const commentsFor = (comments, itemId) =>
  comments.filter((c) => c.itemId === itemId).sort((a, b) => (a.createdAt ?? Infinity) - (b.createdAt ?? Infinity));

// Simulated plus real, for "4 comments" labels.
export const commentCount = (item, comments) => item.sim.length + commentsFor(comments, item.id).length;
