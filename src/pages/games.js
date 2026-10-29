import { state } from '../store.js';
import { byDateDesc } from '../stats.js';
import { gameList } from './dashboard.js';
import { isEditor } from '../auth.js';

export function render(root) {
  const games = [...state.games].sort(byDateDesc);
  root.innerHTML = `<section class="card">
    <div class="between"><h2>Games</h2>${isEditor() ? '<a class="btn" href="#/games/new">+ Add game</a>' : ''}</div>
    ${games.length ? gameList(games) : '<p class="muted">No games yet.</p>'}
  </section>`;
}
