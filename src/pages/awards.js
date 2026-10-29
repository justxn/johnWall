import { addDoc, collection, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase.js';
import { state } from '../store.js';
import { awardWins } from '../awards.js';
import { isEditor } from '../auth.js';
import { esc, playerName } from '../util.js';

export function render(root) {
  const wins = awardWins(state.games, state.categories, state.votes);

  root.innerHTML = `<section class="card">
    <h2>Awards</h2>
    ${state.categories.map((c) => {
      const board = Object.entries(wins[c.id] || {}).sort((a, b) => b[1] - a[1]);
      return `<div class="award">
        <div class="between"><h3>${esc(c.name)}</h3>
          ${c.isDefault || !isEditor() ? '' : `<button class="link danger-text" data-del="${c.id}">Remove</button>`}</div>
        ${board.length ? `<div>${board.map(([id, n]) => `${esc(playerName(state.players, id))}: <strong>${n}</strong>`).join(' · ')}</div>` : '<div class="muted">No winners yet</div>'}
      </div>`;
    }).join('')}
  </section>
  ${isEditor() ? `<section class="card">
    <h3>Add a custom award</h3>
    <form id="cat-form" class="row">
      <input name="name" placeholder="e.g. Best Hustle" required />
      <button class="btn">Add</button>
    </form>
  </section>` : ''}`;

  const catForm = root.querySelector('#cat-form');
  if (catForm) {
    catForm.onsubmit = async (e) => {
      e.preventDefault();
      const name = e.target.name.value.trim();
      if (name) await addDoc(collection(db, 'awardCategories'), { name, isDefault: false });
    };
  }
  root.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = async () => {
      if (confirm('Remove this award? Existing votes for it stop counting.')) {
        await deleteDoc(doc(db, 'awardCategories', b.dataset.del));
      }
    };
  });
}
