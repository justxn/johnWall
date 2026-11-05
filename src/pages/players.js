import { html, nothing } from 'lit-html';
import { activeInjuries, injuryOf, sortedPlayers, state } from '../store.js';
import { isTeam } from '../auth.js';
import { addPlayer } from '../actions.js';
import { awardWins } from '../awards.js';
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
  isFinal,
  leaders,
  playerLine,
  shootingLeaders,
  shootingOf,
} from '../stats.js';
import { icon, injuryPill, openSheet, rerender, segmented, toast } from '../ui.js';
import { normName } from '../util.js';

export const meta = { tab: 'players' };

// The chosen stat sticks while you move around the app.
let stat = 'points';
let totals = false;

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

// Page title for both Players views, with the add button for the team.
export const playersHeader = (current) => html`
  <div class="between">
    <h1>Players</h1>
    ${isTeam() ? html`<button class="btn sm" @click=${addPlayerSheet}>${icon('plus')}Add player</button>` : nothing}
  </div>
  ${playerTabs(current)}`;

export const playerTabs = (current) => {
  const hurt = activeInjuries().length;
  return segmented(
    [
      { href: '#/players', label: 'Stats', active: current === 'stats' },
      { href: '#/injuries', label: hurt ? `Injury report (${hurt})` : 'Injury report', active: current === 'injuries' },
    ],
    'Players',
  );
};

function choose(next) {
  stat = next;
  rerender();
}

// Leaderboard tabs: points, then shooting percentages, then everything else.
const TABS = ['points', ...SHOOTING.map((s) => s.key), ...STAT_KEYS.filter((k) => k !== 'points'), 'awards'];
const tabLabel = (k) => (k === 'awards' ? '🏆 Awards' : shootingOf(k)?.pct ?? STAT_LABELS[k]);

function ranking() {
  const players = sortedPlayers();
  const done = finalStats(state.games, state.stats);
  if (shootingOf(stat)) return shootingLeaders(players, done, stat);
  if (stat !== 'awards') return leaders(players, done, stat, { totals });
  const wins = awardWins(state.games.filter(isFinal), state.categories, state.votes);
  const count = (id) => Object.values(wins).reduce((n, byPlayer) => n + (byPlayer[id] || 0), 0);
  return players
    .map((player) => ({ player, value: count(player.id), line: playerLine(player.id, done) }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value || a.player.name.localeCompare(b.player.name));
}

function shown(value) {
  if (stat === 'awards') return String(value);
  if (shootingOf(stat)) return fmtPct(value);
  return totals ? fmtStat(value, stat) : fmtAvg(value, stat);
}

function sub(row) {
  const { gp, tracked } = row.line;
  if (stat === 'awards') return `${row.value === 1 ? 'award' : 'awards'}`;
  if (shootingOf(stat)) return `${row.line.shots[stat].made}/${row.line.shots[stat].att}`;
  const partial = tracked[stat] < gp ? ` · ${tracked[stat]} tracked` : '';
  return `${gp} GP${partial}`;
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
  const label = stat === 'awards' ? 'Awards won' : shot ? shot.pct : totals ? `Total ${STAT_NAMES[stat].toLowerCase()}` : AVG_LABELS[stat];
  const none = stat === 'awards' ? 'No awards won yet.' : `No ${(shot ? shot.name : STAT_NAMES[stat]).toLowerCase()} tracked yet.`;
  return html`
    ${playersHeader('stats')}
    <div class="chips" role="tablist" aria-label="Stat">
      ${TABS.map((k) => html`<button
        role="tab"
        class="chip ${stat === k ? 'on' : ''}"
        aria-selected=${stat === k ? 'true' : 'false'}
        @click=${() => choose(k)}
      >${tabLabel(k)}</button>`)}
    </div>
    ${stat === 'awards' || shot
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
        : html`<p class="pad muted">${none}</p>`}
    </section>
    ${others.length
      ? html`<section class="card flush">
          <div class="card-head"><h2>${stat === 'awards' ? 'No awards yet' : 'Not tracked yet'}</h2></div>
          <ul class="list">${others.map((p) => html`<li><a class="row-link" href="#/players/${p.id}">
            <span class="grow"><strong class="ellipsis">${p.name}</strong></span>${injuryPill(injuryOf(p.id))}${icon('chevron', 'chev')}
          </a></li>`)}</ul>
        </section>`
      : nothing}`;
}
