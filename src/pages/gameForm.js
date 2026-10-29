import { html, nothing } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import { findGame, gameStats, sortedPlayers, state, teamName } from '../store.js';
import { newGameId, saveResult, saveScheduled } from '../actions.js';
import { STAT_KEYS, STAT_LABELS, byDateAsc, byDateDesc, pointsCheck, statusOf } from '../stats.js';
import { backLink, rerender } from '../ui.js';
import { todayISO } from '../util.js';

export const meta = { tab: 'games', teamOnly: true };

// Form state for this visit. The game id is chosen when the form opens, so a
// double-tapped Save (or a slow connection) writes one game, not two.
let form = null;

export function enter() {
  form = null;
}

const val = (v) => (v == null ? '' : String(v));
const toNum = (v) => {
  const s = String(v ?? '').trim();
  if (s === '') return null; // blank = not tracked
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
};

const plusDays = (iso, days) => {
  const [y, m, d] = iso.split('-').map(Number);
  return todayISO(new Date(y, m - 1, d + days));
};

// New games default to the usual time slot, and a scheduled game to a week
// after the last one on the schedule.
function defaults() {
  const lastTimed = [...state.games].sort(byDateDesc).find((g) => g.time);
  const lastScheduled = state.games.filter((g) => statusOf(g) === 'scheduled').sort(byDateAsc).at(-1);
  const nextWeek = lastScheduled?.date ? plusDays(lastScheduled.date, 7) : todayISO();
  return { time: lastTimed?.time || '', scheduleDate: nextWeek >= todayISO() ? nextWeek : todayISO() };
}

function setup(id, mode) {
  const game = id ? findGame(id) : null;
  const kind = mode === 'edit' && game && statusOf(game) === 'scheduled' ? 'schedule' : mode === 'schedule' ? 'schedule' : 'result';
  const lines = id ? Object.fromEntries(gameStats(id).map((s) => [s.playerId, s])) : {};
  return {
    key: `${id}|${mode}`,
    id: id || newGameId(),
    isNew: !id,
    kind,
    lines,
    played: new Set(Object.keys(lines)),
    showInactive: false,
    error: '',
    mismatch: null,
  };
}

export function view([id], { mode }) {
  const game = id ? findGame(id) : null;
  if (id && !game) return html`${backLink('#/games', 'Games')}<section class="card"><p>Game not found.</p></section>`;
  if (game && statusOf(game) === 'live') {
    return html`${backLink(`#/games/${id}`, 'Game')}
      <section class="card"><h2>This game is being scored live</h2><a class="btn" href="#/games/${id}/live">Open the scorekeeper</a></section>`;
  }
  if (!form || form.key !== `${id}|${mode}`) form = setup(id, mode);
  return form.kind === 'schedule' ? scheduleForm(game) : resultForm(game);
}

const cancelHref = (game) => (game ? `#/games/${game.id}` : '#/games');

function fail(message) {
  form.error = message;
  rerender();
}

// --- Upcoming game ----------------------------------------------------------

function scheduleForm(game) {
  const d = defaults();
  return html`${backLink(cancelHref(game), game ? 'Game' : 'Games')}
    <form class="card stack" novalidate @submit=${submitSchedule}>
      <h1>${game ? 'Edit game' : 'Schedule a game'}</h1>
      <label>Opponent<input name="opponent" value=${game?.opponent ?? ''} placeholder="Team name" autocomplete="off" /></label>
      <div class="grid2">
        <label>Date<input type="date" name="date" value=${game?.date ?? d.scheduleDate} /></label>
        <label>Time<input type="time" name="time" value=${game?.time ?? d.time} /></label>
      </div>
      <label>Court<input name="location" value=${game?.location ?? ''} placeholder="e.g. IMSB Court 4a" autocomplete="off" /></label>
      ${form.error ? html`<p class="err">${form.error}</p>` : nothing}
      <div class="form-actions"><a class="btn secondary" href=${cancelHref(game)}>Cancel</a><button class="btn">Save</button></div>
    </form>`;
}

function submitSchedule(e) {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  const opponent = String(fd.get('opponent')).trim();
  const date = String(fd.get('date'));
  if (!opponent || !date) return fail('Add who you\'re playing and the date.');
  saveScheduled(form.id, { opponent, date, time: String(fd.get('time')), location: String(fd.get('location')).trim() }, { isNew: form.isNew });
  location.hash = `#/games/${form.id}`;
}

// --- Final score and box score ----------------------------------------------

function togglePlayed(playerId, on) {
  if (on) form.played.add(playerId);
  else form.played.delete(playerId);
  rerender();
}

function entry(player) {
  const on = form.played.has(player.id);
  const line = form.lines[player.id] || {};
  return html`<div class="player-entry ${on ? '' : 'off'}">
    <label class="switch between">
      <strong class="ellipsis">${player.name}</strong>
      <input type="checkbox" .checked=${on} @change=${(e) => togglePlayed(player.id, e.target.checked)} />
      <span class="track" aria-hidden="true"></span>
      <span class="sr-only">Played</span>
    </label>
    <div class="statgrid">
      ${STAT_KEYS.map((k) => html`<label>${STAT_LABELS[k]}
        <input name="${k}:${player.id}" inputmode="numeric" pattern="[0-9]*" autocomplete="off" enterkeyhint="next" value=${val(line[k])} />
      </label>`)}
    </div>
  </div>`;
}

// Re-check the "points don't add up" warning as people type.
function onInput(e) {
  const fd = new FormData(e.currentTarget);
  const lines = [...form.played].map((pid) => ({ points: toNum(fd.get(`points:${pid}`)) }));
  const next = pointsCheck(toNum(fd.get('teamScore')), lines);
  if (JSON.stringify(next) !== JSON.stringify(form.mismatch)) {
    form.mismatch = next;
    rerender();
  }
}

function resultForm(game) {
  const d = defaults();
  const everyone = sortedPlayers();
  const shown = everyone.filter((p) => p.active !== false || form.lines[p.id] || form.showInactive);
  const hidden = everyone.length - shown.length;
  const title = !game ? 'Add a final score' : statusOf(game) === 'scheduled' ? 'Final score' : 'Edit game';
  return html`${backLink(cancelHref(game), game ? 'Game' : 'Games')}
    <form class="stack" novalidate @submit=${submitResult} @input=${onInput}>
      <section class="card stack">
        <h1>${title}</h1>
        <label>Opponent<input name="opponent" value=${game?.opponent ?? ''} placeholder="Team name" autocomplete="off" /></label>
        <div class="grid2">
          <label>Date<input type="date" name="date" value=${game?.date ?? todayISO()} /></label>
          <label>Time<input type="time" name="time" value=${game?.time ?? d.time} /></label>
        </div>
        <label>Court<input name="location" value=${game?.location ?? ''} placeholder="e.g. IMSB Court 4a" autocomplete="off" /></label>
        <div class="score-inputs">
          <label class="center">${teamName()}<input name="teamScore" inputmode="numeric" pattern="[0-9]*" autocomplete="off" value=${val(game?.teamScore)} /></label>
          <label class="center">Them<input name="opponentScore" inputmode="numeric" pattern="[0-9]*" autocomplete="off" value=${val(game?.opponentScore)} /></label>
        </div>
        <label>Notes<textarea name="notes" placeholder="Optional" .value=${game?.notes ?? ''}></textarea></label>
      </section>
      <section class="card stack">
        <div>
          <h2>Box score</h2>
          <p class="hint">Switch on everyone who played. Leave a stat blank if nobody tracked it.</p>
        </div>
        ${everyone.length ? nothing : html`<p class="muted">No players yet. Add them in Settings → Roster.</p>`}
        ${repeat(shown, (p) => p.id, entry)}
        ${hidden && !form.showInactive
          ? html`<button type="button" class="btn ghost" @click=${() => { form.showInactive = true; rerender(); }}>
              Show ${hidden} inactive player${hidden === 1 ? '' : 's'}
            </button>`
          : nothing}
        ${form.mismatch
          ? html`<p class="warning">Player points add up to ${form.mismatch.sum}, but the score says ${form.mismatch.teamScore}. You can still save.</p>`
          : nothing}
      </section>
      ${form.error ? html`<p class="err">${form.error}</p>` : nothing}
      <div class="form-actions"><a class="btn secondary" href=${cancelHref(game)}>Cancel</a><button class="btn">Save</button></div>
    </form>`;
}

function submitResult(e) {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  const opponent = String(fd.get('opponent')).trim();
  const date = String(fd.get('date'));
  const teamScore = toNum(fd.get('teamScore'));
  const opponentScore = toNum(fd.get('opponentScore'));
  if (!opponent || !date) return fail('Add who you played and the date.');
  if (teamScore == null || opponentScore == null) return fail('Enter both scores.');
  if (teamScore === opponentScore) return fail('It can\'t end in a tie. One team has to win.');

  const lines = {};
  for (const p of state.players) {
    if (form.played.has(p.id)) lines[p.id] = Object.fromEntries(STAT_KEYS.map((k) => [k, toNum(fd.get(`${k}:${p.id}`))]));
    else if (form.lines[p.id]) lines[p.id] = null; // was in the box score, switched off now
  }
  const fields = {
    opponent,
    date,
    time: String(fd.get('time')),
    location: String(fd.get('location')).trim(),
    teamScore,
    opponentScore,
    notes: String(fd.get('notes')).trim(),
  };
  saveResult(form.id, fields, lines, { isNew: form.isNew });
  location.hash = `#/games/${form.id}`;
}
