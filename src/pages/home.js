import { html, nothing } from 'lit-html';
import { activeInjuries, injuryOf, state } from '../store.js';
import { isMember, isTeam } from '../auth.js';
import { latestWinners } from '../awards.js';
import {
  AVG_LABELS,
  finalStats,
  finals,
  fmtAvg,
  isFinal,
  leaders,
  liveGames,
  needsResult,
  record,
  streak,
  teamAverages,
  upcoming,
} from '../stats.js';
import { clockMs } from '../live.js';
import { dateBlock, gameRow, icon, injuryPill, livePill } from '../ui.js';
import { fmtClock, fmtDate, fmtTime, playerName, todayISO } from '../util.js';
import { h2hLine, injuryNote } from './parts.js';

export const meta = { tab: 'home', fab: true };

export function view() {
  const today = todayISO();
  const next = upcoming(state.games, today)[0];
  return html`
    ${liveGames(state.games).map(liveBanner)}
    ${isTeam() ? needsResult(state.games, today).map(pendingCard) : nothing}
    ${next ? nextGameCard(next, today) : noNextGame()}
    ${recordCard()}
    ${leadersCard()}
    ${mvpCard()}
    ${injuryCard()}
    ${recentCard()}
    ${isMember() ? nothing : joinCard()}`;
}

const liveBanner = (g) => html`<a class="live-banner" href="#/games/${g.id}">
  ${livePill()}
  <span class="grow"><strong class="ellipsis">vs ${g.opponent}</strong><small class="muted">${fmtClock(clockMs(g.live))}</small></span>
  <span class="score">${g.teamScore}–${g.opponentScore}</span>
</a>`;

const pendingCard = (g) => html`<section class="card">
  <div><strong>How did it go vs ${g.opponent}?</strong><br /><small class="muted">The ${fmtDate(g.date)} game still needs a score.</small></div>
  <a class="btn" href="#/games/${g.id}/result">Enter the score</a>
</section>`;

function nextGameCard(g, today) {
  const gameDay = g.date === today;
  return html`<section class="card next-game">
    <div class="card-head"><h2>${gameDay ? 'Game day' : 'Next game'}</h2><a href="#/games/${g.id}">Details</a></div>
    <a class="next-head plain" href="#/games/${g.id}">
      ${dateBlock(g.date)}
      <div class="grow">
        <span class="vs ellipsis">vs ${g.opponent || 'TBD'}</span>
        <div class="meta-line">
          ${g.time ? html`<span>${icon('clock')}${fmtTime(g.time)}</span>` : nothing}
          ${g.location ? html`<span>${icon('pin')}${g.location}</span>` : nothing}
        </div>
      </div>
    </a>
    <small class="muted">${h2hLine(g.opponent, { excludeId: g.id })}</small>
    ${injuryNote()}
    ${isTeam() && gameDay ? html`<a class="btn block" href="#/games/${g.id}/live">${icon('live')}Start live scoring</a>` : nothing}
  </section>`;
}

const noNextGame = () => html`<section class="card">
  <h2>Next game</h2>
  <p class="muted">Nothing on the schedule yet.</p>
  ${isTeam() ? html`<a class="btn secondary" href="#/games/schedule">${icon('calendar')}Schedule a game</a>` : nothing}
</section>`;

function recordCard() {
  const { wins, losses } = record(state.games);
  const s = streak(state.games);
  const avg = teamAverages(state.games);
  return html`<section class="card hero">
    <div class="big">${wins}–${losses}</div>
    <div class="facts">
      <strong>${state.games.some(isFinal) ? 'Season record' : 'No games played yet'}</strong>
      ${s ? html`<span class="pill ${s.type === 'W' ? 'win' : 'loss'}">${s.type}${s.count} streak</span>` : nothing}
    </div>
    ${avg
      ? html`<div class="statline" style="grid-column: 1 / -1">
          <span><b>${avg.ppg.toFixed(1)}</b> points per game</span>
          <span><b>${avg.oppg.toFixed(1)}</b> allowed</span>
          <span><b>${avg.diff > 0 ? '+' : ''}${avg.diff.toFixed(1)}</b> margin</span>
        </div>`
      : nothing}
  </section>`;
}

// The three headline stats, in one row.
const LEADER_STATS = ['points', 'rebounds', 'assists'];

function leadersCard() {
  const done = finalStats(state.games, state.stats);
  const tops = LEADER_STATS.map((k) => ({ k, top: leaders(state.players, done, k)[0] }));
  if (!tops.some((x) => x.top)) return nothing;
  return html`<section class="card">
    <div class="card-head"><h2>Team leaders</h2><a href="#/players">All stats</a></div>
    <div class="leaders">
      ${tops.map(({ k, top }) =>
        top
          ? html`<a class="leader" href="#/players/${top.player.id}">
              <small class="muted">${AVG_LABELS[k]}</small>
              <strong>${fmtAvg(top.value)}</strong>
              <span class="ellipsis">${top.player.name}</span>
            </a>`
          : html`<div class="leader"><small class="muted">${AVG_LABELS[k]}</small><strong>—</strong><span class="muted">Not tracked</span></div>`,
      )}
    </div>
  </section>`;
}

function mvpCard() {
  const mvp = latestWinners(state.games, state.votes, 'mvp');
  if (!mvp) return nothing;
  return html`<a class="card plain" href="#/games/${mvp.game.id}">
    <div class="between">
      <div class="grow">
        <small class="muted">Latest MVP · vs ${mvp.game.opponent}, ${fmtDate(mvp.game.date, { weekday: false })}</small>
        <strong class="vs">🏆 ${mvp.winners.map((id) => playerName(state.players, id)).join(' & ')}</strong>
      </div>
      ${icon('chevron', 'chev')}
    </div>
  </a>`;
}

function injuryCard() {
  const list = activeInjuries();
  if (!list.length) return nothing;
  return html`<section class="card">
    <div class="card-head"><h2>Injury report</h2><a href="#/injuries">See all</a></div>
    <ul class="list">
      ${list.map((i) => html`<li><a class="row-link" href="#/players/${i.playerId}">
        <span class="grow"><strong class="ellipsis">${playerName(state.players, i.playerId)}</strong><small class="muted ellipsis">${i.note || ''}</small></span>
        ${injuryPill(injuryOf(i.playerId))}
      </a></li>`)}
    </ul>
  </section>`;
}

function recentCard() {
  const recent = finals(state.games).slice(0, 3);
  return html`<section class="card flush">
    <div class="card-head"><h2>Recent results</h2><a href="#/games">All games</a></div>
    ${recent.length ? html`<ul class="list">${recent.map(gameRow)}</ul>` : html`<p class="pad muted">No results yet.</p>`}
  </section>`;
}

const joinCard = () => html`<section class="card">
  <h2>On the team?</h2>
  <p class="muted">Join with your team code to keep score, report injuries and vote for MVP. Fans can join with the fan code to vote.</p>
  <a class="btn" href="#/join">Join</a>
</section>`;
