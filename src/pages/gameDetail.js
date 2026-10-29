import { doc, deleteDoc, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase.js';
import { state } from '../store.js';
import { myId } from '../auth.js';
import { tally, winners } from '../awards.js';
import { resultOf, fmtStat } from '../stats.js';
import { esc, fmtDate, playerName } from '../util.js';

export function render(root, [gameId]) {
  const game = state.games.find((g) => g.id === gameId);
  if (!game) {
    root.innerHTML = '<section class="card"><p>Game not found.</p><a href="#/games">Back to games</a></section>';
    return;
  }
  const r = resultOf(game);
  const rows = state.stats.filter((s) => s.gameId === gameId);
  const rowPlayers = rows
    .map((s) => ({ ...s, name: playerName(state.players, s.playerId) }))
    .sort((a, b) => (b.points ?? -1) - (a.points ?? -1));
  // Nominees are whoever played; if no box score was entered, anyone.
  const nominees = rows.length
    ? rows.map((s) => s.playerId)
    : state.players.map((p) => p.id);
  const uid = myId();

  root.innerHTML = `
    <section class="card">
      <div class="between">
        <div>
          <h2><span class="pill ${r === 'W' ? 'win' : 'loss'}">${r}</span> vs ${esc(game.opponent)}</h2>
          <div class="muted">${fmtDate(game.date)}</div>
        </div>
        <div class="big sm">${game.teamScore}–${game.opponentScore}</div>
      </div>
      ${game.notes ? `<p>${esc(game.notes)}</p>` : ''}
      <div class="row">
        <a class="btn alt" href="#/games/${game.id}/edit">Edit</a>
        <button class="btn danger" id="del">Delete</button>
      </div>
    </section>

    <section class="card">
      <h2>Box score</h2>
      ${rowPlayers.length ? `<div class="scroll"><table class="box">
        <thead><tr><th>Player</th><th>PTS</th><th>REB</th><th>AST</th></tr></thead>
        <tbody>${rowPlayers.map((s) => `<tr><td>${esc(s.name)}</td><td>${fmtStat(s.points)}</td><td>${fmtStat(s.rebounds)}</td><td>${fmtStat(s.assists)}</td></tr>`).join('')}</tbody>
      </table></div><p class="muted">— = not tracked</p>` : '<p class="muted">No box score entered. Use Edit to add one.</p>'}
    </section>

    <section class="card">
      <h2>Awards</h2>
      ${state.categories.map((c) => categoryBlock(c, game, nominees, uid)).join('')}
    </section>`;

  root.querySelector('#del').onclick = async () => {
    if (!confirm('Delete this game, its box score and its votes?')) return;
    const batch = writeBatch(db);
    rows.forEach((s) => batch.delete(doc(db, 'games', gameId, 'stats', s.playerId)));
    state.votes.filter((v) => v.gameId === gameId).forEach((v) => batch.delete(doc(db, 'games', gameId, 'votes', v.id)));
    batch.delete(doc(db, 'games', gameId));
    await batch.commit();
    location.hash = '#/games';
  };

  root.querySelectorAll('select[data-cat]').forEach((sel) => {
    sel.onchange = async () => {
      const categoryId = sel.dataset.cat;
      const ref = doc(db, 'games', gameId, 'votes', `${uid}_${categoryId}`);
      if (!sel.value) await deleteDoc(ref);
      else await setDoc(ref, { gameId, categoryId, voterId: uid, nomineeId: sel.value });
    };
  });
}

function categoryBlock(c, game, nominees, uid) {
  const counts = tally(state.votes, game.id, c.id);
  const won = winners(counts);
  const mine = state.votes.find((v) => v.gameId === game.id && v.categoryId === c.id && v.voterId === uid);
  const options = nominees
    .filter((id) => id !== uid) // no voting for yourself
    .map((id) => ({ id, name: playerName(state.players, id) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const results = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  return `<div class="award">
    <div class="between"><h3>${esc(c.name)}</h3>
      ${won.length ? `<span class="pill gold">🏆 ${won.map((id) => esc(playerName(state.players, id))).join(' & ')}</span>` : ''}
    </div>
    <select data-cat="${c.id}">
      <option value="">— your vote —</option>
      ${options.map((o) => `<option value="${o.id}" ${mine?.nomineeId === o.id ? 'selected' : ''}>${esc(o.name)}</option>`).join('')}
    </select>
    ${results.length ? `<div class="muted">${results.map(([id, n]) => `${esc(playerName(state.players, id))}: ${n}`).join(' · ')}</div>` : '<div class="muted">No votes yet</div>'}
  </div>`;
}
