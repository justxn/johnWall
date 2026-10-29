import { html, nothing } from 'lit-html';
import { state } from '../store.js';
import { isTeam } from '../auth.js';
import { finals, liveGames, needsResult, upcoming } from '../stats.js';
import { dateBlock, empty, gameRow, icon, livePill } from '../ui.js';
import { fmtDate, fmtTime, todayISO } from '../util.js';

export const meta = { tab: 'games', fab: true };

const scheduledRow = (g, sub) => html`<li>
  <a class="row-link" href="#/games/${g.id}">
    ${dateBlock(g.date)}
    <span class="grow">
      <strong class="ellipsis">vs ${g.opponent || 'TBD'}</strong>
      <small class="muted ellipsis">${[fmtTime(g.time), g.location].filter(Boolean).join(' · ')}</small>
      ${sub}
    </span>
    ${icon('chevron', 'chev')}
  </a>
</li>`;

const liveRow = (g) => html`<li>
  <a class="row-link" href="#/games/${g.id}">
    ${livePill()}
    <span class="grow"><strong class="ellipsis">vs ${g.opponent}</strong></span>
    <strong class="score">${g.teamScore}–${g.opponentScore}</strong>
  </a>
</li>`;

export function view() {
  const today = todayISO();
  const live = liveGames(state.games);
  const pending = needsResult(state.games, today);
  const next = upcoming(state.games, today);
  const results = finals(state.games);

  return html`
    <h1>Games</h1>
    ${live.length
      ? html`<section class="card flush"><div class="card-head"><h2>Live now</h2></div><ul class="list">${live.map(liveRow)}</ul></section>`
      : nothing}
    ${pending.length
      ? html`<section class="card flush">
          <div class="card-head"><h2>Waiting for a score</h2></div>
          <ul class="list">${pending.map((g) => scheduledRow(g, html`<small class="muted">${isTeam() ? 'Tap to enter the result' : `Played ${fmtDate(g.date)}`}</small>`))}</ul>
        </section>`
      : nothing}
    <section class="card flush">
      <div class="card-head"><h2>Upcoming</h2>${isTeam() ? html`<a href="#/games/schedule">+ Schedule</a>` : nothing}</div>
      ${next.length
        ? html`<ul class="list">${next.map((g) => scheduledRow(g, nothing))}</ul>`
        : html`<p class="pad muted">Nothing on the schedule.</p>`}
    </section>
    <section class="card flush">
      <div class="card-head"><h2>Results</h2>${isTeam() ? html`<a href="#/games/new">+ Add score</a>` : nothing}</div>
      ${results.length ? html`<ul class="list">${results.map(gameRow)}</ul>` : html`<div class="pad">${empty('No games played yet.')}</div>`}
    </section>`;
}
