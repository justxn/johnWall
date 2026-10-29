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
import { STAT_KEYS, STAT_LABELS, statusOf } from '../stats.js';
import { clockMs, clockRunning, isOnCourt, playedMs } from '../live.js';
import { backLink, icon, injuryPill, livePill, rerender, toast } from '../ui.js';
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

function initSetup(game) {
  return {
    key: game?.id ?? 'new',
    id: game?.id ?? newGameId(),
    // Nobody to start with: anyone left switched on by mistake would get a
    // game played with all zeros.
    players: new Set(),
    tracked: new Set(STAT_KEYS),
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
        <div><h2>What are you tracking?</h2><p class="hint">Points are always on. Minutes run off the game clock and who's on the court.</p></div>
        <div class="chips wrap">
          ${STAT_KEYS.filter((k) => k !== 'points').map((k) => {
            const on = setup.tracked.has(k);
            return html`<button type="button" class="chip ${on ? 'on' : ''}" aria-pressed=${on ? 'true' : 'false'} @click=${() => toggleIn(setup.tracked, k, !on)}>${STAT_LABELS[k]}</button>`;
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
  const tracked = STAT_KEYS.filter((k) => k === 'points' || setup.tracked.has(k));
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

function tap(game, playerId, stat, n) {
  scorePlayer(game.id, playerId, stat, n);
  undo.push({ playerId, stat, n });
  buzz();
}

function opp(game, n) {
  if (n < 0 && !(game.opponentScore > 0)) return;
  scoreOpponent(game.id, n);
  undo.push({ opp: true, n });
  buzz();
}

function undoLast(game) {
  const last = undo.pop();
  if (!last) return;
  if (last.opp) {
    scoreOpponent(game.id, -last.n);
    toast(`Undid ${last.n > 0 ? '+' : ''}${last.n} for them`);
  } else {
    scorePlayer(game.id, last.playerId, last.stat, -last.n);
    const what = last.stat === 'points' ? `+${last.n}` : STAT_LABELS[last.stat];
    toast(`Undid ${what} for ${findPlayer(last.playerId)?.name ?? 'player'}`);
  }
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

function tapCard(game, line, tracked) {
  const pid = line.playerId;
  const name = findPlayer(pid)?.name ?? 'Unknown';
  const on = isOnCourt(game.live, pid);
  const withMinutes = tracked.includes('minutes');
  const counted = tracked.filter((k) => k !== 'minutes');
  const statButtons = counted.filter((k) => k !== 'points');
  return html`<section class="tap-card ${on ? 'on-court' : ''}">
    <div class="tap-head">
      <div class="grow">
        <strong class="ellipsis">${name}</strong>
        <span class="tap-line">
          ${counted.map((k, i) => html`${i ? ' · ' : ''}<b>${line[k] ?? 0}</b> ${STAT_LABELS[k]}`)}
          ${withMinutes ? html` · <b>${fmtClock(playedMs(game.live, pid))}</b> MIN` : nothing}
        </span>
      </div>
      ${withMinutes
        ? html`<button class="court-toggle ${on ? 'on' : ''}" aria-pressed=${on ? 'true' : 'false'} @click=${() => toggleCourt(game, pid)}>
            ${on ? 'On court' : 'Bench'}
          </button>`
        : nothing}
    </div>
    <div class="tap-row points">
      ${[1, 2, 3].map((n) => html`<button aria-label="${name} scored ${n}" @click=${() => tap(game, pid, 'points', n)}>+${n}</button>`)}
    </div>
    ${statButtons.length
      ? html`<div class="tap-row stats" style="grid-template-columns: repeat(${statButtons.length}, 1fr)">
          ${statButtons.map((k) => html`<button aria-label="${name} ${STAT_LABELS[k]}" @click=${() => tap(game, pid, k, 1)}>${STAT_LABELS[k]}</button>`)}
        </div>`
      : nothing}
  </section>`;
}

function scorerView(game) {
  const live = game.live || {};
  const tracked = live.tracked || STAT_KEYS;
  const lines = gameStats(game.id).sort((a, b) => (findPlayer(a.playerId)?.name ?? '').localeCompare(findPlayer(b.playerId)?.name ?? ''));
  const running = clockRunning(live);
  const bench = activePlayers().filter((p) => !lines.some((l) => l.playerId === p.id));
  return html`
    <section class="scoreboard" aria-label="Scoreboard">
      <div class="sb-top">
        <a class="icon-btn" href="#/games/${game.id}" aria-label="Back to the game page">${icon('back')}</a>
        ${livePill()}
        <button class="icon-btn" aria-label="Undo the last tap" ?disabled=${!undo.length} @click=${() => undoLast(game)}>${icon('undo')}</button>
      </div>
      <div class="sb-scores">
        <div><span>${teamName()}</span><strong>${game.teamScore ?? 0}</strong></div>
        <div class="sb-clock">
          <span class="time">${fmtClock(clockMs(live))}</span>
          <button class=${running ? 'running' : ''} aria-label=${running ? 'Stop the clock' : 'Start the clock'} @click=${() => toggleClock(game)}>
            ${icon(running ? 'pause' : 'play')}
          </button>
        </div>
        <div><span>${game.opponent}</span><strong>${game.opponentScore ?? 0}</strong></div>
      </div>
      <div class="opp-buttons">
        <span class="label">THEY SCORED</span>
        ${[1, 2, 3].map((n) => html`<button aria-label="They scored ${n}" @click=${() => opp(game, n)}>+${n}</button>`)}
        <button aria-label="Take a point off their score" @click=${() => opp(game, -1)}>−1</button>
      </div>
    </section>
    ${repeat(lines, (l) => l.playerId, (l) => tapCard(game, l, tracked))}
    ${bench.length
      ? html`<section class="card">
          <label>Add a player
            <select @change=${(e) => {
              if (e.target.value) addLivePlayer(game, e.target.value);
              e.target.value = '';
            }}>
              <option value="">Choose…</option>
              ${bench.map((p) => html`<option value=${p.id}>${p.name}</option>`)}
            </select>
          </label>
        </section>`
      : nothing}
    <section class="card stack">
      <button class="btn block" @click=${() => finish(game)}>${icon('check')}Finish game</button>
      <button class="btn danger-ghost" @click=${() => cancel(game)}>Cancel live scoring</button>
    </section>`;
}
