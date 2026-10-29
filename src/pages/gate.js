import { state } from '../store.js';
import { hasAccess, isEditor, enterCode, pickPlayer, addPlayer, enterAsGuest } from '../auth.js';
import { esc } from '../util.js';

export function render(root, { onDone }) {
  root.innerHTML = hasAccess() ? pickView() : codeView();

  const codeForm = root.querySelector('#code-form');
  if (codeForm) {
    codeForm.onsubmit = async (e) => {
      e.preventDefault();
      const ok = await enterCode(codeForm.code.value);
      if (ok) onDone();
      else root.querySelector('#err').textContent = 'Wrong group code.';
    };
    return;
  }

  root.querySelectorAll('[data-pick]').forEach((b) => {
    b.onclick = () => {
      pickPlayer(b.dataset.pick);
      onDone();
    };
  });
  const addForm = root.querySelector('#add-form');
  addForm.onsubmit = async (e) => {
    e.preventDefault();
    const name = addForm.name.value.trim();
    if (!name) return;
    if (isEditor()) {
      pickPlayer(await addPlayer(name));
    } else {
      enterAsGuest(name); // viewers aren't added to the player list
    }
    onDone();
  };
}

function codeView() {
  const first = state.group == null;
  return `<main class="card narrow">
    <h1>🏀 Intramural Hoops</h1>
    <p class="muted">${first ? 'First time here: choose a group code and share it with your friends.' : 'Enter the group code (or the viewer code) to get in.'}</p>
    <form id="code-form" class="stack">
      <input name="code" placeholder="Group code" autocomplete="off" required />
      <button class="btn">${first ? 'Set code' : 'Enter'}</button>
      <p id="err" class="err"></p>
    </form>
  </main>`;
}

function pickView() {
  const players = [...state.players].sort((a, b) => a.name.localeCompare(b.name));
  return `<main class="card narrow">
    <h1>Who are you?</h1>
    <div class="pick">${players.map((p) => `<button class="btn alt" data-pick="${p.id}">${esc(p.name)}</button>`).join('') || '<p class="muted">No players yet. Add yourself below.</p>'}</div>
    <form id="add-form" class="row">
      <input name="name" placeholder="${isEditor() ? 'Not listed? Type your name' : 'Not a player? Type your name'}" required />
      <button class="btn">${isEditor() ? 'Add me' : 'Continue'}</button>
    </form>
  </main>`;
}
