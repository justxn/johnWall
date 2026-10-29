import { html, nothing } from 'lit-html';
import { activePlayers, findGame, gameStats, state, teamName } from '../store.js';
import { isMember, isTeam, myPlayerId } from '../auth.js';
import { castVote, deleteGame, myVote } from '../actions.js';
import { tally, winners } from '../awards.js';
import { headToHead, resultOf, statusOf } from '../stats.js';
import { clockMs, clockRunning } from '../live.js';
import { openRecap } from '../recap.js';
import { backLink, dateBlock, icon, livePill, resultPill, when } from '../ui.js';
import { fmtClock, playerName } from '../util.js';
import { boxScore, h2hLine, myRsvp, rsvpList, rsvpSummary } from './parts.js';

export const meta = { tab: 'games' };

export function view([id]) {
  const game = findGame(id);
  if (!game) {
    return html`${backLink('#/games', 'Games')}<section class="card"><p>Game not found. It may have been deleted.</p></section>`;
  }
  const status = statusOf(game);
  return html`${backLink('#/games', 'Games')}
    ${status === 'scheduled' ? scheduled(game) : status === 'live' ? live(game) : final(game)}`;
}

const metaLine = (game) => html`<div class="meta-line">
  ${game.date ? html`<span>${icon('calendar')}${when(game)}</span>` : nothing}
  ${game.location ? html`<span>${icon('pin')}${game.location}</span>` : nothing}
</div>`;

function remove(game) {
  if (!confirm('Delete this game, its box score, RSVPs and votes?')) return;
  deleteGame(game);
  location.hash = '#/games';
}

const matchup = (game) => {
  const done = statusOf(game) === 'final';
  const won = done && resultOf(game) === 'W';
  return html`<div class="matchup">
    <div class="side ${done && !won ? 'lost' : ''}"><span>${teamName()}</span><strong>${game.teamScore ?? 0}</strong></div>
    <div class="mid">${done ? html`${resultPill(game)}<span>Final</span>` : livePill()}</div>
    <div class="side ${won ? 'lost' : ''}"><span>${game.opponent}</span><strong>${game.opponentScore ?? 0}</strong></div>
  </div>`;
};

function scheduled(game) {
  return html`
    <section class="card">
      <div class="next-head">
        ${dateBlock(game.date)}
        <div class="grow"><small class="muted">Upcoming</small><h1 class="vs">vs ${game.opponent || 'TBD'}</h1></div>
      </div>
      ${metaLine(game)}
      <p class="muted">${h2hLine(game.opponent, { excludeId: game.id })}</p>
      ${isTeam()
        ? html`<div class="stack">
            <a class="btn block" href="#/games/${game.id}/live">${icon('live')}Start live scoring</a>
            <a class="btn secondary block" href="#/games/${game.id}/result">Enter the final score</a>
            <div class="row">
              <a class="btn ghost" href="#/games/${game.id}/edit">${icon('edit')}Edit details</a>
              <button class="btn danger-ghost" @click=${() => remove(game)}>Delete</button>
            </div>
          </div>`
        : nothing}
    </section>
    <section class="card">
      <h2>Who's in?</h2>
      ${rsvpSummary(game)}
      ${myRsvp(game)}
      ${rsvpList(game)}
    </section>`;
}

function live(game) {
  return html`
    <section class="card">
      ${matchup(game)}
      <p class="center muted">${fmtClock(clockMs(game.live))}${clockRunning(game.live) ? '' : ' · clock stopped'}</p>
      ${metaLine(game)}
      ${isTeam() ? html`<a class="btn block" href="#/games/${game.id}/live">Open the scorekeeper</a>` : nothing}
    </section>
    <section class="card"><h2>Box score</h2>${boxScore(game) || html`<p class="muted">No stats yet.</p>`}</section>`;
}

function seriesLine(game) {
  const h = headToHead(state.games, game.opponent);
  return h.games.length > 1 ? `You're ${h.wins}–${h.losses} against them.` : '';
}

function final(game) {
  const series = seriesLine(game);
  const categories = [...state.categories].sort((a, b) => Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault)) || a.name.localeCompare(b.name));
  return html`
    <section class="card">
      ${matchup(game)}
      ${metaLine(game)}
      ${game.notes ? html`<p class="notes">${game.notes}</p>` : nothing}
      ${series ? html`<p class="muted">${series}</p>` : nothing}
      <div class="row">
        <button class="btn secondary" @click=${() => openRecap(game)}>${icon('share')}Share recap</button>
        ${isTeam()
          ? html`<a class="btn ghost" href="#/games/${game.id}/edit">${icon('edit')}Edit</a>
              <button class="btn danger-ghost" @click=${() => remove(game)}>Delete</button>`
          : nothing}
      </div>
    </section>
    <section class="card">
      <h2>Box score</h2>
      ${boxScore(game) || html`<p class="muted">No box score entered.${isTeam() ? ' Use Edit to add one.' : ''}</p>`}
    </section>
    <section class="card">
      <h2>Awards</h2>
      ${isMember() ? nothing : html`<p class="muted"><a href="#/join">Join</a> to vote.</p>`}
      ${categories.length ? categories.map((c) => awardBlock(c, game)) : html`<p class="muted">No awards set up yet.</p>`}
    </section>`;
}

function awardBlock(category, game) {
  const counts = tally(state.votes, game.id, category.id);
  const won = winners(counts);
  const lines = gameStats(game.id);
  // Nominees are whoever played; with no box score, anyone on the roster.
  const nominees = (lines.length ? lines.map((s) => s.playerId) : activePlayers().map((p) => p.id))
    .filter((id) => id !== myPlayerId()) // no voting for yourself
    .map((id) => ({ id, name: playerName(state.players, id) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const mine = isMember() ? myVote(game.id, category.id) : null;
  const results = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return html`<div class="award">
    <div class="between">
      <h3>${category.name}</h3>
      ${won.length ? html`<span class="pill gold">🏆 ${won.map((id) => playerName(state.players, id)).join(' & ')}</span>` : nothing}
    </div>
    ${isMember()
      ? html`<select aria-label="Your ${category.name} vote" @change=${(e) => castVote(game.id, category.id, e.target.value || null)}>
          <option value="" ?selected=${!mine}>— your vote —</option>
          ${nominees.map((o) => html`<option value=${o.id} ?selected=${mine?.nomineeId === o.id}>${o.name}</option>`)}
        </select>`
      : nothing}
    <small class="muted">${results.length ? results.map(([id, n]) => `${playerName(state.players, id)}: ${n}`).join(' · ') : 'No votes yet'}</small>
  </div>`;
}
