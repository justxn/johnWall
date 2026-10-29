import { html, nothing } from 'lit-html';
import { activePlayers, state, teamName } from '../store.js';
import { claimPlayer, clearLegacyPlayer, createTeam, isMember, isTeam, join, legacyCode, legacyPlayerId, role, setMyName } from '../auth.js';
import { addPlayer, describeError } from '../actions.js';
import { rerender, toast } from '../ui.js';

export const meta = { tab: null };

let ui = { busy: false, error: '', creating: false };

export function enter() {
  ui = { busy: false, error: '', creating: false };
}

export function view() {
  if (!isMember()) return ui.creating ? createForm() : codeForm();
  return isTeam() ? whoAreYou() : fanName();
}

function authError(err) {
  if (err?.code === 'auth/operation-not-allowed' || err?.code === 'auth/admin-restricted-operation') {
    return 'Sign-in isn\'t turned on for this Firebase project yet. Enable Anonymous sign-in (see README).';
  }
  if (err?.code === 'auth/network-request-failed' || err?.code === 'unavailable') return 'Couldn\'t reach the server. Check your connection.';
  return describeError(err);
}

async function run(task) {
  if (!state.online) {
    ui.error = 'You\'re offline. Joining needs a connection.';
    return rerender();
  }
  ui.busy = true;
  ui.error = '';
  rerender();
  try {
    await task();
  } catch (err) {
    console.error(err);
    ui.error = authError(err);
  } finally {
    ui.busy = false;
    rerender();
  }
}

function codeForm() {
  return html`<section class="card stack">
    <h1>Join ${teamName()}</h1>
    <p class="muted">Players and scorekeepers use the team code. Friends who just want to vote for MVP use the fan code.</p>
    <form class="stack" novalidate @submit=${(e) => {
      e.preventDefault();
      const code = String(new FormData(e.currentTarget).get('code'));
      if (!code.trim()) return;
      run(async () => {
        const joined = await join(code);
        if (!joined) ui.error = 'That code didn\'t work. Double-check it with your team.';
        else toast(joined === 'team' ? 'You\'re on the team!' : 'You\'re in as a fan!');
      });
    }}>
      <label>Code<input name="code" value=${legacyCode()} autocomplete="off" autocapitalize="off" spellcheck="false" /></label>
      ${ui.error ? html`<p class="err">${ui.error}</p>` : nothing}
      <button class="btn block" ?disabled=${ui.busy}>${ui.busy ? 'Checking…' : 'Join'}</button>
    </form>
    <button class="btn ghost" @click=${() => { ui.creating = true; ui.error = ''; rerender(); }}>Setting up the app for a new team?</button>
  </section>`;
}

function createForm() {
  return html`<section class="card stack">
    <h1>Set up your team</h1>
    <p class="muted">Only for a brand-new app. If your team already uses it, go back and enter the team code.</p>
    <form class="stack" novalidate @submit=${(e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const name = String(fd.get('teamName')).trim();
      const code = String(fd.get('code')).trim();
      const fanCode = String(fd.get('fanCode')).trim();
      if (!name) return (ui.error = 'Give the team a name.'), rerender();
      if (code.length < 4) return (ui.error = 'Make the team code at least 4 characters.'), rerender();
      if (fanCode && fanCode === code) return (ui.error = 'Use a different fan code from the team code.'), rerender();
      run(async () => {
        try {
          await createTeam({ teamName: name, code, fanCode });
          toast('Team created!');
        } catch (err) {
          if (err.code === 'permission-denied') ui.error = 'This app already has a team. Go back and enter its team code.';
          else throw err;
        }
      });
    }}>
      <label>Team name<input name="teamName" placeholder="e.g. John Wall" autocomplete="off" /></label>
      <label>Team code <span class="hint">For players. Anyone with it can change everything.</span><input name="code" autocomplete="off" autocapitalize="off" /></label>
      <label>Fan code <span class="hint">Optional. Lets friends vote for awards.</span><input name="fanCode" autocomplete="off" autocapitalize="off" /></label>
      ${ui.error ? html`<p class="err">${ui.error}</p>` : nothing}
      <button class="btn block" ?disabled=${ui.busy}>${ui.busy ? 'Creating…' : 'Create team'}</button>
    </form>
    <button class="btn ghost" @click=${() => { ui.creating = false; ui.error = ''; rerender(); }}>Back</button>
  </section>`;
}

function pick(playerId) {
  claimPlayer(playerId).catch((err) => toast(describeError(err), 'error'));
  clearLegacyPlayer();
  location.hash = '#/';
}

function whoAreYou() {
  const players = activePlayers();
  const mine = state.member?.playerId || null;
  const suggested = mine || legacyPlayerId();
  return html`<section class="card stack">
    <h1>Who are you?</h1>
    <p class="muted">Pick your name so your RSVPs and votes count as you. You can do this on each of your devices.</p>
    <div class="pick">
      ${players.map((p) => html`<button class="btn ${p.id === suggested ? '' : 'secondary'}" @click=${() => pick(p.id)}>${p.name}</button>`)}
    </div>
    ${players.length ? nothing : html`<p class="muted">No players yet. Add yourself below.</p>`}
    <form class="row" @submit=${(e) => {
      e.preventDefault();
      const input = e.currentTarget.elements.namedItem('name');
      if (!input.value.trim()) return;
      pick(addPlayer(input.value));
    }}>
      <input name="name" placeholder="Not listed? Type your name" autocomplete="off" />
      <button class="btn secondary">Add me</button>
    </form>
    <a class="btn ghost" href="#/">${mine ? 'Done' : 'Skip, I\'m not a player'}</a>
  </section>`;
}

function fanName() {
  return html`<section class="card stack">
    <h1>You're in as a fan</h1>
    <p class="muted">You can vote for awards on each game's page. Add your name so the team knows who you are.</p>
    <form class="stack" @submit=${(e) => {
      e.preventDefault();
      const name = String(new FormData(e.currentTarget).get('name')).trim();
      if (name) setMyName(name).catch((err) => toast(describeError(err), 'error'));
      location.hash = '#/';
    }}>
      <label>Your name<input name="name" value=${state.member?.name ?? ''} autocomplete="off" /></label>
      <button class="btn block">Done</button>
    </form>
  </section>
  ${role() === 'fan'
    ? html`<section class="card stack">
        <h2>On the team?</h2>
        <form class="row" novalidate @submit=${(e) => {
          e.preventDefault();
          const code = String(new FormData(e.currentTarget).get('code'));
          if (!code.trim()) return;
          run(async () => {
            if ((await join(code)) === 'team') toast('You\'re on the team!');
            else ui.error = 'That isn\'t the team code.';
          });
        }}>
          <input name="code" placeholder="Team code" aria-label="Team code" autocomplete="off" autocapitalize="off" />
          <button class="btn secondary" ?disabled=${ui.busy}>Upgrade</button>
        </form>
        ${ui.error ? html`<p class="err">${ui.error}</p>` : nothing}
      </section>`
    : nothing}`;
}
