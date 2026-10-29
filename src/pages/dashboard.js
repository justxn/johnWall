import { state } from '../store.js';
import { record, streak, resultOf, byDateDesc } from '../stats.js';
import { esc, fmtDate } from '../util.js';
import { isEditor, setViewerCode } from '../auth.js';

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
      <div class="between"><h2>Recent games</h2>${isEditor() ? '<a class="btn" href="#/games/new">+ Add game</a>' : ''}</div>
      ${recent.length ? gameList(recent) : '<p class="muted">No games yet.</p>'}
    </section>
    ${isEditor() ? `<section class="card">
      <h3>Viewer code</h3>
      <p class="muted">Share this with friends who should only view and vote. ${state.group?.viewerCode ? '' : 'None set yet.'}</p>
      <form id="viewer-form" class="row">
        <input name="code" value="${esc(state.group?.viewerCode || '')}" placeholder="Viewer code" autocomplete="off" />
        <button class="btn">Save</button>
      </form>
    </section>` : ''}`;

  const form = root.querySelector('#viewer-form');
  if (form) {
    form.onsubmit = async (e) => {
      e.preventDefault();
      await setViewerCode(form.code.value);
    };
  }
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
