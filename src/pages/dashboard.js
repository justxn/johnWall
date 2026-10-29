import { state } from '../store.js';
import { record, streak, resultOf, byDateDesc } from '../stats.js';
import { esc, fmtDate } from '../util.js';

export function render(root) {
  const { wins, losses } = record(state.games);
  const s = streak(state.games);
  const recent = [...state.games].sort(byDateDesc).slice(0, 5);

  root.innerHTML = `
    <section class="card hero">
      <div class="big">${wins}–${losses}</div>
      <div class="muted">${state.games.length ? `Season record${s ? ` · ${s.type}${s.count} streak` : ''}` : 'No games yet'}</div>
    </section>
    <section class="card">
      <div class="between"><h2>Recent games</h2><a class="btn" href="#/games/new">+ Add game</a></div>
      ${recent.length ? gameList(recent) : '<p class="muted">Add your first game to get started.</p>'}
    </section>`;
}

export function gameList(games) {
  return `<ul class="list">${games
    .map((g) => {
      const r = resultOf(g);
      return `<li><a href="#/games/${g.id}">
        <span class="pill ${r === 'W' ? 'win' : 'loss'}">${r}</span>
        <span class="grow">vs ${esc(g.opponent || 'Opponent')}<small class="muted"> ${fmtDate(g.date)}</small></span>
        <strong>${g.teamScore}–${g.opponentScore}</strong>
      </a></li>`;
    })
    .join('')}</ul>`;
}
