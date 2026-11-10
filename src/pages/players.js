// The Players tab: stat leaderboards. Awards and the injury report are the
// tab's other two views (pages/awards.js and pages/injuries.js).
import { html, nothing } from 'lit-html';
import { activeInjuries, injuryOf, sortedPlayers, state } from '../store.js';
import { isTeam } from '../auth.js';
import { addPlayer } from '../actions.js';
import {
  AVG_LABELS,
  SHOOTING,
  STAT_KEYS,
  STAT_LABELS,
  STAT_NAMES,
  finalStats,
  fmtAvg,
  fmtPct,
  fmtStat,
  leaders,
  shootingLeaders,
  shootingOf,
} from '../stats.js';
import { count, icon, injuryPill, openSheet, pageHead, rerender, segmented, toast } from '../ui.js';
import { normName } from '../util.js';

export const meta = { tab: 'players' };

// The chosen stat sticks while you move around the app.
let stat = 'points';
let totals = false;

// The tab's title and its three views. `action` is the current view's main
// button (team members only).
export const playersHeader = (current, action = nothing) => html`
  ${pageHead('Players', isTeam() ? action : nothing)}
  ${segmented(
    [
      { href: '#/players', label: 'Stats', active: current === 'stats' },
      { href: '#/awards', label: 'Awards', active: current === 'awards' },
      { href: '#/injuries', label: html`Injuries${count(activeInjuries().length, 'alert')}`, active: current === 'injuries' },
    ],
    'Players',
  )}`;

// Stays open so several players can be added in a row.
function addPlayerSheet() {
  openSheet(
    () => html`<form class="stack" novalidate @submit=${(e) => {
      e.preventDefault();
      const input = e.currentTarget.elements.namedItem('name');
      const name = input.value.trim();
      if (!name) return;
      if (state.players.some((p) => normName(p.name) === normName(name))) return toast(`${name} is already on the roster`, 'error');
      addPlayer(name);
      toast(`Added ${name}`);
      input.value = '';
    }}>
      <label>Name<input name="name" placeholder="e.g. Clyde" autocomplete="off" autocapitalize="words" enterkeyhint="done" /></label>
      <button class="btn block">Add to the roster</button>
      <p class="hint">Rename players or mark them inactive in Settings → Roster.</p>
    </form>`,
    { title: 'Add a player' },
  );
}

// Leaderboard chips: points, then shooting percentages, then everything else.
const CHIPS = ['points', ...SHOOTING.map((s) => s.key), ...STAT_KEYS.filter((k) => k !== 'points')];
const chipLabel = (k) => shootingOf(k)?.pct ?? STAT_LABELS[k];

function ranking() {
  const players = sortedPlayers();
  const done = finalStats(state.games, state.stats);
  return shootingOf(stat) ? shootingLeaders(players, done, stat) : leaders(players, done, stat, { totals });
}

const shown = (value) => (shootingOf(stat) ? fmtPct(value) : totals ? fmtStat(value, stat) : fmtAvg(value, stat));

function sub(row) {
  if (shootingOf(stat)) return `${row.line.shots[stat].made}/${row.line.shots[stat].att}`;
  const { gp, tracked } = row.line;
  return `${gp} GP${tracked[stat] < gp ? ` · ${tracked[stat]} tracked` : ''}`;
}

const rowView = (row, i) => html`<a class="lb-row" href="#/players/${row.player.id}">
  <span class="lb-rank">${i + 1}</span>
  <span class="lb-name">
    <strong><span class="ellipsis">${row.player.name}</span>${injuryPill(injuryOf(row.player.id))}</strong>
    ${row.player.archetype ? html`<small class="muted ellipsis">${row.player.archetype}</small>` : nothing}
  </span>
  <span><span class="lb-value">${shown(row.value)}</span><span class="lb-sub">${sub(row)}</span></span>
  ${icon('chevron', 'chev')}
</a>`;

export function view() {
  const rows = ranking();
  const others = sortedPlayers().filter((p) => p.active !== false && !rows.some((r) => r.player.id === p.id));
  const shot = shootingOf(stat);
  const label = shot ? shot.pct : totals ? `Total ${STAT_NAMES[stat].toLowerCase()}` : AVG_LABELS[stat];
  const addButton = html`<button class="btn sm" @click=${addPlayerSheet}>${icon('plus')}Add player</button>`;
  return html`
    ${playersHeader('stats', addButton)}
    <div class="chips" role="tablist" aria-label="Stat">
      ${CHIPS.map((k) => html`<button role="tab" class="chip ${stat === k ? 'on' : ''}" aria-selected=${stat === k ? 'true' : 'false'}
        @click=${() => { stat = k; rerender(); }}>${chipLabel(k)}</button>`)}
    </div>
    ${shot
      ? nothing
      : segmented(
          [
            { label: 'Per game', active: !totals, onClick: () => { totals = false; rerender(); } },
            { label: 'Totals', active: totals, onClick: () => { totals = true; rerender(); } },
          ],
          'Per game or totals',
        )}
    <section class="card flush">
      <div class="card-head"><h2>${label}</h2>${isTeam() ? html`<a href="#/settings">Roster</a>` : nothing}</div>
      ${rows.length
        ? html`<div>${rows.map(rowView)}</div>`
        : html`<p class="pad muted">No ${(shot ? shot.name : STAT_NAMES[stat]).toLowerCase()} tracked yet.</p>`}
    </section>
    ${others.length
      ? html`<section class="card flush">
          <div class="card-head"><h2>Not tracked yet</h2></div>
          <ul class="list">${others.map((p) => html`<li><a class="row-link" href="#/players/${p.id}">
            <span class="grow"><strong class="ellipsis">${p.name}</strong></span>${injuryPill(injuryOf(p.id))}${icon('chevron', 'chev')}
          </a></li>`)}</ul>
        </section>`
      : nothing}`;
}
