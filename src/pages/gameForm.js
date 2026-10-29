import { doc, collection, writeBatch } from 'firebase/firestore';
import { db } from '../firebase.js';
import { state } from '../store.js';
import { esc, todayISO } from '../util.js';
import { STAT_KEYS } from '../stats.js';

// Left alone on snapshot updates so typing isn't wiped mid-entry.
export const isForm = true;

const toNum = (v) => {
  const s = String(v).trim();
  if (s === '') return null; // blank = not tracked
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
};

export function render(root, [gameId]) {
  const game = gameId ? state.games.find((g) => g.id === gameId) : null;
  if (gameId && !game) {
    root.innerHTML = '<section class="card"><p>Game not found.</p></section>';
    return;
  }
  const existing = Object.fromEntries(
    state.stats.filter((s) => s.gameId === gameId).map((s) => [s.playerId, s]),
  );
  const players = [...state.players].sort((a, b) => a.name.localeCompare(b.name));
  const val = (v) => (v == null ? '' : v);

  root.innerHTML = `<form class="card stack" id="game-form">
    <h2>${game ? 'Edit game' : 'Add game'}</h2>
    <div class="grid2">
      <label>Date<input type="date" name="date" value="${game?.date || todayISO()}" required /></label>
      <label>Opponent<input name="opponent" value="${esc(game?.opponent || '')}" placeholder="Team name" required /></label>
      <label>Our score<input type="number" min="0" name="teamScore" value="${val(game?.teamScore)}" required /></label>
      <label>Their score<input type="number" min="0" name="opponentScore" value="${val(game?.opponentScore)}" required /></label>
    </div>
    <label>Notes<input name="notes" value="${esc(game?.notes || '')}" placeholder="Optional" /></label>

    <h3>Box score</h3>
    <p class="muted">Check who played. Leave a stat blank if it wasn't tracked.</p>
    <div class="scroll"><table class="box">
      <thead><tr><th>Played</th><th>Player</th><th>PTS</th><th>REB</th><th>AST</th></tr></thead>
      <tbody>${players
        .map((p) => {
          const s = existing[p.id];
          return `<tr data-player="${p.id}">
            <td><input type="checkbox" class="played" ${s ? 'checked' : ''} /></td>
            <td>${esc(p.name)}</td>
            ${STAT_KEYS.map((k) => `<td><input type="number" min="0" class="stat" data-k="${k}" value="${val(s?.[k])}" /></td>`).join('')}
          </tr>`;
        })
        .join('')}</tbody>
    </table></div>
    <p id="err" class="err"></p>
    <div class="row"><button class="btn">Save</button><a class="btn alt" href="#/games${game ? '/' + game.id : ''}">Cancel</a></div>
  </form>`;

  const form = root.querySelector('#game-form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const err = root.querySelector('#err');
    const teamScore = toNum(form.teamScore.value);
    const opponentScore = toNum(form.opponentScore.value);
    if (teamScore == null || opponentScore == null) {
      err.textContent = 'Enter both scores.';
      return;
    }
    if (teamScore === opponentScore) {
      err.textContent = 'Ties aren\'t supported: one team has to win.';
      return;
    }

    const ref = game ? doc(db, 'games', game.id) : doc(collection(db, 'games'));
    const batch = writeBatch(db);
    batch.set(ref, {
      date: form.date.value,
      opponent: form.opponent.value.trim(),
      teamScore,
      opponentScore,
      notes: form.notes.value.trim(),
    });

    form.querySelectorAll('tbody tr').forEach((tr) => {
      const playerId = tr.dataset.player;
      const sref = doc(db, 'games', ref.id, 'stats', playerId);
      if (!tr.querySelector('.played').checked) {
        if (existing[playerId]) batch.delete(sref);
        return;
      }
      const row = { gameId: ref.id, playerId };
      tr.querySelectorAll('.stat').forEach((i) => {
        row[i.dataset.k] = toNum(i.value);
      });
      batch.set(sref, row);
    });

    try {
      await batch.commit();
      location.hash = `#/games/${ref.id}`;
    } catch (ex) {
      console.error(ex);
      err.textContent = 'Save failed. Check your connection and try again.';
    }
  };
}
