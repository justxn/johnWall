import { html, nothing } from 'lit-html';
import { sortedPlayers, state } from '../store.js';
import { isTeam } from '../auth.js';
import { addCategory, removeCategory } from '../actions.js';
import { awardWins, latestWinners } from '../awards.js';
import { TIER_KEYS, TIER_SHORT, badgeHolders } from '../badges.js';
import { finalStats, isFinal } from '../stats.js';
import { icon } from '../ui.js';
import { fmtDate, playerName } from '../util.js';
import { medal, openBadgeSheet } from './parts.js';

export const meta = { tab: 'awards' };

const byImportance = (a, b) => Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault)) || a.name.localeCompare(b.name);

export function view() {
  const wins = awardWins(state.games.filter(isFinal), state.categories, state.votes);
  const categories = [...state.categories].sort(byImportance);
  return html`
    <h1>Awards</h1>
    ${categories.length ? categories.map((c) => standings(c, wins[c.id] || {})) : html`<section class="card"><p class="muted">No awards yet.</p></section>`}
    ${badgesCard()}
    ${isTeam() ? addForm() : nothing}`;
}

// Who holds each badge, best tier first.
function badgesCard() {
  const held = badgeHolders(sortedPlayers(), finalStats(state.games, state.stats)).filter((b) => b.holders.length);
  return html`<section class="card flush">
    <div class="card-head"><h2>Badges</h2><button class="link" @click=${() => openBadgeSheet()}>How to earn</button></div>
    ${held.length
      ? html`<ul class="list">${held.map(({ badge, holders }) => html`<li class="badge-row">
          ${medal(badge)}
          <span class="grow">
            <strong>${badge.name}</strong>
            <span class="row">${holders.map((h) => html`<a class="pill tier-${TIER_KEYS[h.tier]}" href="#/players/${h.player.id}">${h.player.name} · ${TIER_SHORT[h.tier]}</a>`)}</span>
          </span>
        </li>`)}</ul>`
      : html`<p class="pad muted">No badges yet. They're earned from season stats as games get played.</p>`}
  </section>`;
}

function remove(category) {
  if (confirm(`Remove "${category.name}"? Its votes are deleted too.`)) removeCategory(category.id);
}

function standings(category, board) {
  const rows = Object.entries(board).sort((a, b) => b[1] - a[1] || playerName(state.players, a[0]).localeCompare(playerName(state.players, b[0])));
  const latest = latestWinners(state.games, state.votes, category.id);
  return html`<section class="card flush">
    <div class="card-head">
      <h2>${category.name}</h2>
      ${category.isDefault || !isTeam() ? nothing : html`<button class="btn danger-ghost sm" @click=${() => remove(category)}>Remove</button>`}
    </div>
    ${latest
      ? html`<p class="pad muted">Latest: ${latest.winners.map((id) => playerName(state.players, id)).join(' & ')} vs ${latest.game.opponent}, ${fmtDate(latest.game.date, { weekday: false })}</p>`
      : nothing}
    ${rows.length
      ? html`<ul class="list">${rows.map(([id, count], i) => html`<li><a class="row-link" href="#/players/${id}">
          <span class="lb-rank">${i + 1}</span>
          <span class="grow"><strong class="ellipsis">${playerName(state.players, id)}</strong></span>
          <strong class="num">${count}×</strong>
          ${icon('chevron', 'chev')}
        </a></li>`)}</ul>`
      : html`<p class="pad muted">No winners yet. Vote on a game's page after it's played.</p>`}
  </section>`;
}

const addForm = () => html`<section class="card">
  <h2>Add a custom award</h2>
  <form class="row" @submit=${(e) => {
    e.preventDefault();
    const input = e.currentTarget.elements.namedItem('award');
    if (!input.value.trim()) return;
    addCategory(input.value);
    input.value = '';
  }}>
    <input name="award" placeholder="e.g. Best Hustle" maxlength="40" autocomplete="off" />
    <button class="btn">Add</button>
  </form>
</section>`;
