import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase.js';
import { state } from '../store.js';
import { myId, isEditor } from '../auth.js';
import { playerLine, fmtAvg, STAT_KEYS, AVG_LABELS } from '../stats.js';
import { awardWins } from '../awards.js';
import { esc } from '../util.js';

const MAX_ARCHETYPE = 60;

// Which row is being edited, and what's been typed. Kept at module level so a
// live Firestore update re-rendering the page doesn't lose the draft.
let editing = null;
let draft = '';

const archForm = () => `<form id="arch-form" class="stack">
  <input name="archetype" maxlength="${MAX_ARCHETYPE}" value="${esc(draft)}" placeholder='e.g. "Michael Jordan"' autocomplete="off" />
  <span class="row"><button class="btn">Save</button><button type="button" class="btn alt" id="arch-cancel">Cancel</button></span>
  <span id="arch-err" class="err"></span>
</form>`;

export function render(root) {
  const wins = awardWins(state.games, state.categories, state.votes);
  const total = (pid) => Object.values(wins).reduce((n, byPlayer) => n + (byPlayer[pid] || 0), 0);

  const rows = state.players
    .map((p) => ({ p, line: playerLine(p.id, state.stats), awards: total(p.id) }))
    .sort((a, b) => (b.line.avg.points ?? -1) - (a.line.avg.points ?? -1));

  // Show "(n/gp)" when a stat was only tracked in some of the games played.
  const cell = (line, k) => {
    const note = line.tracked[k] < line.gp ? ` <small class="muted">(${line.tracked[k]}/${line.gp})</small>` : '';
    return `${fmtAvg(line.avg[k])}${line.gp ? note : ''}`;
  };

  // Players edit their own archetype; editors can edit anyone's.
  const canEdit = (id) => isEditor() || id === myId();

  root.innerHTML = `<section class="card">
    <h2>Player stats</h2>
    ${rows.length ? `<div class="scroll"><table class="box">
      <thead><tr><th>Player</th><th>Archetype</th><th>GP</th>${STAT_KEYS.map((k) => `<th>${AVG_LABELS[k]}</th>`).join('')}<th>🏆</th></tr></thead>
      <tbody>${rows.map(({ p, line, awards }) => `<tr>
        <td>${esc(p.name)}</td>
        <td class="arch">${p.id === editing ? archForm() : `${p.archetype ? esc(p.archetype) : '<span class="muted">—</span>'}${canEdit(p.id) ? ` <button class="link" data-arch="${p.id}">Edit</button>` : ''}`}</td>
        <td>${line.gp}</td>
        ${STAT_KEYS.map((k) => `<td>${cell(line, k)}</td>`).join('')}
        <td>${awards}</td></tr>`).join('')}</tbody>
    </table></div>
    <p class="muted">Averages only count games where the stat was tracked. (n/gp) shows how many games that is. 🏆 = awards won.</p>` : '<p class="muted">No players yet.</p>'}
  </section>`;

  root.querySelectorAll('[data-arch]').forEach((b) => {
    b.onclick = () => {
      editing = b.dataset.arch;
      draft = state.players.find((p) => p.id === editing)?.archetype || '';
      render(root);
    };
  });

  const form = root.querySelector('#arch-form');
  if (form) {
    const input = form.elements.archetype;
    input.oninput = () => { draft = input.value; };
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
    root.querySelector('#arch-cancel').onclick = () => {
      editing = null;
      render(root);
    };
    form.onsubmit = async (e) => {
      e.preventDefault();
      try {
        await updateDoc(doc(db, 'players', editing), { archetype: input.value.trim().slice(0, MAX_ARCHETYPE) });
        editing = null;
        render(root);
      } catch (err) {
        console.error(err);
        root.querySelector('#arch-err').textContent = 'Save failed. Check your connection and try again.';
      }
    };
  }
}
