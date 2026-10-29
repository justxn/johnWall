import { html, nothing } from 'lit-html';
import { activeInjuries, injuryOf, sortedPlayers, state } from '../store.js';
import { isTeam } from '../auth.js';
import { awardWins } from '../awards.js';
import { AVG_LABELS, STAT_KEYS, STAT_LABELS, STAT_NAMES, finalStats, fmtAvg, isFinal, leaders, playerLine } from '../stats.js';
import { icon, injuryPill, rerender, segmented } from '../ui.js';

export const meta = { tab: 'players' };

// The chosen stat sticks while you move around the app.
let stat = 'points';
let totals = false;

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

function ranking() {
  const players = sortedPlayers();
  const done = finalStats(state.games, state.stats);
  if (stat !== 'awards') return leaders(players, done, stat, { totals });
  const wins = awardWins(state.games.filter(isFinal), state.categories, state.votes);
  const count = (id) => Object.values(wins).reduce((n, byPlayer) => n + (byPlayer[id] || 0), 0);
  return players
    .map((player) => ({ player, value: count(player.id), line: playerLine(player.id, done) }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value || a.player.name.localeCompare(b.player.name));
}

const shown = (value) => (stat === 'awards' || totals ? String(value) : fmtAvg(value));

function sub(row) {
  const { gp, tracked } = row.line;
  if (stat === 'awards') return `${row.value === 1 ? 'award' : 'awards'}`;
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
  const label = stat === 'awards' ? 'Awards won' : totals ? `Total ${STAT_NAMES[stat].toLowerCase()}` : AVG_LABELS[stat];
  return html`
    <h1>Players</h1>
    ${playerTabs('stats')}
    <div class="chips" role="tablist" aria-label="Stat">
      ${[...STAT_KEYS, 'awards'].map((k) => html`<button
        role="tab"
        class="chip ${stat === k ? 'on' : ''}"
        aria-selected=${stat === k ? 'true' : 'false'}
        @click=${() => choose(k)}
      >${k === 'awards' ? '🏆 Awards' : STAT_LABELS[k]}</button>`)}
    </div>
    ${stat === 'awards'
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
        : html`<p class="pad muted">${stat === 'awards' ? 'No awards won yet.' : `No ${STAT_NAMES[stat].toLowerCase()} tracked yet.`}</p>`}
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
