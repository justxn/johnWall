import { html, nothing } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import { activePlayers, findGame, findPlayer, gameStats, injuryOf, teamName } from '../store.js';
import {
  addLivePlayer,
  cancelLive,
  finishLive,
  newGameId,
  scoreOpponent,
  scorePlayer,
  startLive,
  toggleClock,
  toggleCourt,
} from '../actions.js';
import { COURT_STATS, SHOOTING, STAT_KEYS, STAT_LABELS, STAT_NAMES, fmtShots, fmtStat, shotDeltas, statusOf } from '../stats.js';
import { clockMs, clockRunning, isOnCourt, playedMs, plusMinusCourt } from '../live.js';
import { backLink, icon, injuryPill, rerender, toast } from '../ui.js';
import { fmtClock, todayISO } from '../util.js';

export const meta = { tab: 'games', teamOnly: true, bare: true };

// Setup choices and the undo history live only on the scorekeeper's phone.
let setup = null;
let undo = [];
let active = false;
let wakeLock = null;

// Keep the screen on while scoring. Browsers drop the lock when the tab is
// hidden, so take it again when the page comes back.
async function keepAwake(on) {
  try {
    if (on && !wakeLock && 'wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
      });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch { /* unsupported or refused: the screen may dim, nothing else breaks */ }
}
document.addEventListener('visibilitychange', () => {
  if (active && document.visibilityState === 'visible') keepAwake(true);
});

export function enter() {
  setup = null;
  undo = [];
  active = true;
  keepAwake(true);
}

export function leave() {
  active = false;
  keepAwake(false);
}

export function view([id]) {
  if (!id) return setupView(null);
  const game = findGame(id);
  if (!game) return html`${backLink('#/games', 'Games')}<section class="card"><p>Game not found.</p></section>`;
  const status = statusOf(game);
  if (status === 'scheduled') return setupView(game);
  if (status === 'final') {
    return html`${backLink(`#/games/${id}`, 'Game')}
      <section class="card"><h2>This game is over</h2><a class="btn" href="#/games/${id}">See the box score</a></section>`;
  }
  return scorerView(game);
}

// --- Before tip-off ---------------------------------------------------------

const nowHHMM = () => new Date().toTimeString().slice(0, 5);

// What can be switched on or off for a live game. 'shooting' is the FG miss
// and 3PT miss buttons (makes are always tapped), which give FG% and 3P%.
const TRACK_OPTIONS = ['shooting', ...STAT_KEYS.filter((k) => k !== 'points')];
const trackLabel = (k) => (k === 'shooting' ? 'Misses' : STAT_LABELS[k]);

function initSetup(game) {
  return {
    key: game?.id ?? 'new',
    id: game?.id ?? newGameId(),
    // Nobody to start with: anyone left switched on by mistake would get a
    // game played with all zeros.
    players: new Set(),
    tracked: new Set(TRACK_OPTIONS),
    error: '',
  };
}

function toggleIn(set, key, on) {
  if (on) set.add(key);
  else set.delete(key);
  rerender();
}

function setupView(game) {
  if (!setup || setup.key !== (game?.id ?? 'new')) setup = initSetup(game);
  const players = activePlayers();
  return html`${backLink(game ? `#/games/${game.id}` : '#/games', game ? 'Game' : 'Games')}
    <form class="stack" novalidate @submit=${(e) => begin(e, game)}>
      <section class="card stack">
        <h1>Live game</h1>
        ${game
          ? html`<p class="vs">vs ${game.opponent}</p>`
          : html`<label>Opponent<input name="opponent" placeholder="Team name" autocomplete="off" /></label>
              <div class="grid2">
                <label>Date<input type="date" name="date" value=${todayISO()} /></label>
                <label>Time<input type="time" name="time" value=${nowHHMM()} /></label>
              </div>
              <label>Court<input name="location" placeholder="e.g. IMSB Court 4a" autocomplete="off" /></label>`}
      </section>
      <section class="card stack">
        <div><h2>Who's playing?</h2><p class="hint">Switch on everyone who's here. You can add people during the game too.</p></div>
        ${players.length ? nothing : html`<p class="muted">No players yet. Add them in Settings → Roster first.</p>`}
        ${players.map((p) => html`<label class="switch between">
          <span class="row"><strong>${p.name}</strong>${injuryPill(injuryOf(p.id))}</span>
          <input type="checkbox" .checked=${setup.players.has(p.id)} @change=${(e) => toggleIn(setup.players, p.id, e.target.checked)} />
          <span class="track" aria-hidden="true"></span>
        </label>`)}
      </section>
      <section class="card stack">
        <div>
          <h2>What are you tracking?</h2>
          <p class="hint">Points always count. Misses adds FG miss and 3PT miss buttons, for FG% and 3P%. MIN and +/- count while a player is set to On court (MIN only while the clock runs).</p>
        </div>
        <div class="chips wrap">
          ${TRACK_OPTIONS.map((k) => {
            const on = setup.tracked.has(k);
            return html`<button type="button" class="chip ${on ? 'on' : ''}" aria-pressed=${on ? 'true' : 'false'} @click=${() => toggleIn(setup.tracked, k, !on)}>${trackLabel(k)}</button>`;
          })}
        </div>
      </section>
      ${setup.error ? html`<p class="err">${setup.error}</p>` : nothing}
      <button class="btn block">${icon('live')}Start the game</button>
    </form>`;
}

function begin(e, game) {
  e.preventDefault();
  if (!setup.players.size) {
    setup.error = 'Pick at least one player.';
    return rerender();
  }
  const tracked = [...STAT_KEYS, 'shooting'].filter((k) => k === 'points' || setup.tracked.has(k));
  const players = [...setup.players];
  undo = [];
  if (game) {
    startLive(game, players, tracked, { isNew: false });
    return;
  }
  const fd = new FormData(e.currentTarget);
  const opponent = String(fd.get('opponent')).trim();
  if (!opponent) {
    setup.error = 'Who are you playing?';
    return rerender();
  }
  const details = { id: setup.id, opponent, date: String(fd.get('date')) || todayISO(), time: String(fd.get('time')), location: String(fd.get('location')).trim() };
  startLive(details, players, tracked, { isNew: true });
  location.hash = `#/games/${setup.id}/live`;
}

// --- During the game --------------------------------------------------------

const buzz = () => navigator.vibrate?.(12);

// Who's on the court right now, for plus-minus. Undo remembers this list, so
// taking a basket back fixes the right players even after a sub.
const court = (game) => plusMinusCourt(game.live, gameStats(game.id).map((s) => s.playerId));

// Applies one tap's stat changes and remembers them for undo. `what` names the
// tap ("+2", "REB") on the Undo button.
function record(game, playerId, deltas, what) {
  const onFloor = deltas.points ? court(game) : [];
  scorePlayer(game.id, playerId, deltas, onFloor);
  undo.push({ playerId, deltas, court: onFloor, what });
  buzz();
}

// Shot buttons in our league's values (see SHOTS in stats.js). The makes are
// always there; the misses only when misses are being tracked.
const SHOT_BUTTONS = [
  { shot: 'inside', made: true, label: '+1', aria: 'scored 1 inside the arc' },
  { shot: 'three', made: true, label: '+2', aria: 'scored 2 from behind the arc' },
  { shot: 'inside', made: false, label: 'FG miss', aria: 'missed inside the arc' },
  { shot: 'three', made: false, label: '3PT miss', aria: 'missed from behind the arc' },
];

function shoot(game, playerId, button) {
  const shooting = Boolean(game.live?.tracked?.includes('shooting'));
  record(game, playerId, shotDeltas(button.shot, button.made, { shooting }), button.label);
}

function opp(game, n) {
  if (n < 0 && !(game.opponentScore > 0)) return;
  const onFloor = court(game);
  scoreOpponent(game.id, n, onFloor);
  undo.push({ opp: true, n, court: onFloor, what: n > 0 ? `+${n}` : `−${-n}` });
  buzz();
}

// What Undo takes back: "Aarav +2", "them +1".
const undoText = (last) => `${last.opp ? 'them' : findPlayer(last.playerId)?.name ?? 'player'} ${last.what}`;

function undoLast(game) {
  const last = undo.pop();
  if (!last) return;
  if (last.opp) scoreOpponent(game.id, -last.n, last.court);
  else scorePlayer(game.id, last.playerId, Object.fromEntries(Object.entries(last.deltas).map(([k, n]) => [k, -n])), last.court);
  toast(`Undid ${undoText(last)}`);
  rerender();
}

function finish(game) {
  const us = game.teamScore ?? 0;
  const them = game.opponentScore ?? 0;
  if (us === them) return toast('It\'s tied. Someone has to win before you finish.', 'error');
  if (!confirm(`Finish the game at ${us}–${them}?`)) return;
  finishLive(game);
  location.hash = `#/games/${game.id}`;
}

function cancel(game) {
  if (!confirm('Stop live scoring and throw away this box score? The game goes back to upcoming.')) return;
  cancelLive(game);
  location.hash = `#/games/${game.id}`;
}

// The score, the clock, Undo (which says what it would take back) and the
// opponent's buttons, which sit under their score. Kept at the top while
// scrolling.
function scoreboard(game, live) {
  const running = clockRunning(live);
  const last = undo.at(-1);
  return html`<section class="scoreboard" aria-label="Scoreboard">
    <div class="sb-scores">
      <div class="sb-team"><span>${teamName()}</span><strong>${game.teamScore ?? 0}</strong></div>
      <div class="sb-clock">
        <span class="time">${fmtClock(clockMs(live))}</span>
        <button class=${running ? 'running' : ''} aria-label=${running ? 'Stop the clock' : 'Start the clock'} @click=${() => toggleClock(game)}>
          ${icon(running ? 'pause' : 'play')}
        </button>
      </div>
      <div class="sb-team"><span>${game.opponent}</span><strong>${game.opponentScore ?? 0}</strong></div>
    </div>
    <div class="sb-actions">
      <button class="sb-undo" ?disabled=${!last} aria-label=${last ? `Undo ${undoText(last)}` : 'Undo'} @click=${() => undoLast(game)}>
        ${icon('undo')}<span class="ellipsis">${last ? undoText(last) : 'Undo'}</span>
      </button>
      <div class="opp-buttons" role="group" aria-label="Their score">
        ${[1, 2].map((n) => html`<button aria-label="They scored ${n}" @click=${() => opp(game, n)}>+${n}</button>`)}
        <button aria-label="Take a point off their score" ?disabled=${!(game.opponentScore > 0)} @click=${() => opp(game, -1)}>−1</button>
      </div>
    </div>
  </section>`;
}

// One player: their line so far, the On court switch (when minutes or +/- are
// tracked), a row of shot buttons, then one button per stat with its count.
function tapCard(game, line, tracked) {
  const pid = line.playerId;
  const name = findPlayer(pid)?.name ?? 'Unknown';
  const on = isOnCourt(game.live, pid);
  const shooting = tracked.includes('shooting');
  const shots = SHOT_BUTTONS.filter((b) => b.made || shooting);
  const counted = tracked.filter((k) => STAT_KEYS.includes(k) && k !== 'points' && !COURT_STATS.includes(k));
  const summary = [
    [line.points ?? 0, 'PTS'],
    ...(shooting ? SHOOTING.map((s) => [fmtShots(line[s.made] ?? 0, line[s.att] ?? 0), s.label]) : []),
    ...(tracked.includes('minutes') ? [[fmtClock(playedMs(game.live, pid)), 'MIN']] : []),
    ...(tracked.includes('plusMinus') ? [[fmtStat(line.plusMinus ?? 0, 'plusMinus'), '+/-']] : []),
  ];
  return html`<section class="tap-card ${on ? 'on-court' : ''}" aria-label=${name}>
    <div class="tap-top">
      <div class="tap-head">
        <strong class="ellipsis">${name}</strong>
        ${tracked.some((k) => COURT_STATS.includes(k))
          ? html`<button class="court-toggle ${on ? 'on' : ''}" aria-pressed=${on ? 'true' : 'false'} @click=${() => toggleCourt(game, pid)}>
              ${on ? 'On court' : 'Bench'}
            </button>`
          : nothing}
      </div>
      <div class="tap-line">${summary.map(([value, label], i) => html`${i ? ' · ' : ''}<b>${value}</b> ${label}`)}</div>
    </div>
    <div class="tap-pad" style="--cols: ${shots.length}">
      ${shots.map((b) => html`<button class=${b.made ? 'make' : 'miss'} aria-label="${name} ${b.aria}" @click=${() => shoot(game, pid, b)}>${b.label}</button>`)}
    </div>
    ${counted.length
      ? html`<div class="tap-pad" style="--cols: ${counted.length}">
          ${counted.map((k) => html`<button class=${k === 'turnovers' ? 'bad' : ''} aria-label="${name} ${STAT_NAMES[k].toLowerCase()}, ${line[k] ?? 0} so far"
            @click=${() => record(game, pid, { [k]: 1 }, STAT_LABELS[k])}>${STAT_LABELS[k]}<span class="n">${line[k] ?? 0}</span></button>`)}
        </div>`
      : nothing}
  </section>`;
}

function scorerView(game) {
  const live = game.live || {};
  const tracked = live.tracked || STAT_KEYS;
  const lines = gameStats(game.id).sort((a, b) => (findPlayer(a.playerId)?.name ?? '').localeCompare(findPlayer(b.playerId)?.name ?? ''));
  const bench = activePlayers().filter((p) => !lines.some((l) => l.playerId === p.id));
  return html`
    ${backLink(`#/games/${game.id}`, 'Game')}
    ${scoreboard(game, live)}
    ${repeat(lines, (l) => l.playerId, (l) => tapCard(game, l, tracked))}
    <section class="card stack">
      ${bench.length
        ? html`<label>Add a player
            <select @change=${(e) => {
              if (e.target.value) addLivePlayer(game, e.target.value);
              e.target.value = '';
            }}>
              <option value="">Choose…</option>
              ${bench.map((p) => html`<option value=${p.id}>${p.name}</option>`)}
            </select>
          </label>`
        : nothing}
      <button class="btn block" @click=${() => finish(game)}>${icon('check')}Finish game</button>
      <button class="btn danger-ghost" @click=${() => cancel(game)}>Cancel live scoring</button>
    </section>`;
}
