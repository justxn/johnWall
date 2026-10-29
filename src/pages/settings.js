import { html, nothing } from 'lit-html';
import { findPlayer, sortedPlayers, state, teamName } from '../store.js';
import { basicMode, isMember, isTeam, leave, myName, myPlayerId, role, setMyName, usesSignIn } from '../auth.js';
import {
  addPlayer,
  deletePlayer,
  describeError,
  removeMember,
  setCodes,
  setMemberRole,
  setTeamName,
  updatePlayer,
} from '../actions.js';
import { getTheme, setTheme } from '../theme.js';
import { avatar, icon, rerender, segmented, toast } from '../ui.js';
import { fmtDate, todayISO } from '../util.js';

export const meta = { tab: null };

let showCodes = false;
let renaming = null; // player id being renamed

export function enter() {
  showCodes = false;
  renaming = null;
}

export function view() {
  return html`
    <h1>Settings</h1>
    ${youCard()}
    ${appearanceCard()}
    ${isTeam() ? html`${teamCard()}${rosterCard()}${usesSignIn() ? membersCard() : nothing}` : nothing}`;
}

async function signOutHere() {
  if (!confirm('Sign this phone out? You\'ll need the code to get back in.')) return;
  if (usesSignIn() && !state.online) return toast('You\'re offline. Signing out needs a connection.', 'error');
  try {
    await leave();
    location.hash = '#/';
  } catch (err) {
    toast(`Couldn't sign out: ${describeError(err)}`, 'error');
  }
}

function youCard() {
  if (!isMember()) {
    return html`<section class="card">
      <h2>You're just looking</h2>
      <p class="muted">Anyone with the link can see scores and stats. Join with the team code to keep score and update stats, or with the fan code to vote for awards.</p>
      <a class="btn" href="#/join">Join</a>
    </section>`;
  }
  const player = findPlayer(myPlayerId());
  return html`<section class="card">
    <h2>You</h2>
    ${role() === 'team'
      ? html`<div class="between">
          <span class="row">${avatar(player?.name ?? '?')}<span><strong>${player?.name ?? 'Not linked to a player'}</strong><br /><small class="muted">Team member</small></span></span>
          <a class="btn sm secondary" href="#/join">${player ? 'Change' : 'Pick'}</a>
        </div>`
      : html`<form class="stack" @submit=${(e) => {
          e.preventDefault();
          setMyName(String(new FormData(e.currentTarget).get('name'))).then(() => toast('Saved'), (err) => toast(describeError(err), 'error'));
        }}>
          <p class="muted">You joined as a fan, so you can vote for awards.</p>
          <label>Your name<input name="name" value=${myName()} placeholder="So the team knows who's voting" autocomplete="off" /></label>
          <button class="btn secondary">Save name</button>
        </form>`}
    <button class="btn danger-ghost" @click=${signOutHere}>Sign out on this phone</button>
  </section>`;
}

function appearanceCard() {
  const theme = getTheme();
  const pick = (t) => () => {
    setTheme(t);
    rerender();
  };
  return html`<section class="card">
    <h2>Appearance</h2>
    ${segmented(
      [
        { label: 'System', active: theme === 'system', onClick: pick('system') },
        { label: 'Light', active: theme === 'light', onClick: pick('light') },
        { label: 'Dark', active: theme === 'dark', onClick: pick('dark') },
      ],
      'Theme',
    )}
  </section>`;
}

function teamCard() {
  const codes = state.codes;
  const masked = (c) => (c ? (showCodes ? c : '•'.repeat(Math.min(c.length, 8))) : 'not set');
  return html`<section class="card">
    <h2>Team</h2>
    <form class="row" @submit=${(e) => {
      e.preventDefault();
      const name = String(new FormData(e.currentTarget).get('teamName')).trim();
      if (name) {
        setTeamName(name);
        toast('Team name saved');
      }
    }}>
      <input name="teamName" value=${teamName()} aria-label="Team name" maxlength="40" autocomplete="off" />
      <button class="btn secondary">Save</button>
    </form>
    <div class="stack">
      <div class="between">
        <span><small class="muted">Team code</small><br /><strong class="num">${masked(codes?.code)}</strong></span>
        <span><small class="muted">Fan code</small><br /><strong class="num">${masked(codes?.viewerCode)}</strong></span>
        <button class="btn ghost sm" @click=${() => { showCodes = !showCodes; rerender(); }}>${showCodes ? 'Hide' : 'Show'}</button>
      </div>
      <p class="hint">Share the team code with players and the fan code with friends who want to vote.${basicMode() ? '' : ' Only team members can see these.'}</p>
      ${basicMode()
        ? html`<p class="warning">Basic security: codes are checked on each phone, like the first version, and the database is still open to anyone tech-savvy. To lock it down, whoever owns the Firebase project turns on Anonymous sign-in and publishes <code>firestore.rules</code> (see the README). Everyone then taps Join once more.</p>`
        : nothing}
      ${showCodes
        ? html`<form class="stack" @submit=${(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const code = String(fd.get('code')).trim();
            const viewerCode = String(fd.get('viewerCode')).trim();
            if (code.length < 4) return toast('Make the team code at least 4 characters.', 'error');
            if (viewerCode && viewerCode === code) return toast('Use a different fan code from the team code.', 'error');
            setCodes({ code, viewerCode });
            toast('Codes saved. People already in stay in.');
          }}>
            <div class="grid2">
              <label>Team code<input name="code" value=${codes?.code ?? ''} autocomplete="off" /></label>
              <label>Fan code<input name="viewerCode" value=${codes?.viewerCode ?? ''} placeholder="Blank = no fans" autocomplete="off" /></label>
            </div>
            <button class="btn secondary">Change codes</button>
          </form>`
        : nothing}
    </div>
  </section>`;
}

function rosterCard() {
  const players = sortedPlayers();
  const hasStats = (id) => state.stats.some((s) => s.playerId === id);
  const devices = (id) => state.members.filter((m) => m.playerId === id).length;
  return html`<section class="card">
    <h2>Roster</h2>
    <p class="hint">Inactive players drop off the box score form but keep their stats. Only players with no stats can be deleted.</p>
    ${players.map((p) => html`<div class="injury">
      ${renaming === p.id
        ? html`<form class="row" @submit=${(e) => {
            e.preventDefault();
            const name = String(new FormData(e.currentTarget).get('name')).trim();
            if (name) updatePlayer(p.id, { name });
            renaming = null;
            rerender();
          }}>
            <input name="name" value=${p.name} aria-label="Name" autocomplete="off" />
            <button class="btn sm">Save</button>
          </form>`
        : html`<div class="between">
            <span class="grow">
              <strong class="ellipsis">${p.name}</strong>
              ${usesSignIn() ? html`<small class="muted">${devices(p.id) ? `Linked on ${devices(p.id)} ${devices(p.id) === 1 ? 'device' : 'devices'}` : 'Not linked yet'}</small>` : nothing}
            </span>
            <button class="icon-btn" aria-label="Rename ${p.name}" @click=${() => { renaming = p.id; rerender(); }}>${icon('edit')}</button>
          </div>`}
      <div class="between">
        <label class="switch">
          <input type="checkbox" .checked=${p.active !== false} @change=${(e) => updatePlayer(p.id, { active: e.target.checked })} />
          <span class="track" aria-hidden="true"></span>Active
        </label>
        ${hasStats(p.id)
          ? nothing
          : html`<button class="btn danger-ghost sm" @click=${() => confirm(`Delete ${p.name}?`) && deletePlayer(p.id)}>Delete</button>`}
      </div>
    </div>`)}
    <form class="row" @submit=${(e) => {
      e.preventDefault();
      const input = e.currentTarget.elements.namedItem('newPlayer');
      if (!input.value.trim()) return;
      addPlayer(input.value);
      input.value = '';
    }}>
      <input name="newPlayer" placeholder="Add a player" aria-label="New player's name" autocomplete="off" />
      <button class="btn secondary">Add</button>
    </form>
  </section>`;
}

function membersCard() {
  const label = (m) => findPlayer(m.playerId)?.name || m.name || (m.role === 'team' ? 'Team member' : 'Fan');
  const members = [...state.members].sort((a, b) => a.role.localeCompare(b.role) || label(a).localeCompare(label(b)));
  return html`<section class="card">
    <h2>People who joined</h2>
    <p class="hint">Removing someone signs that device out. Change the codes too if they shouldn't come back.</p>
    ${members.map((m) => html`<div class="between member-row">
      <span class="row grow">${avatar(label(m))}<span class="grow">
        <strong class="ellipsis">${label(m)}${m.id === state.uid ? ' (you)' : ''}</strong>
        <small class="muted">${m.joinedAt ? `Joined ${fmtDate(todayISO(new Date(m.joinedAt)))}` : ''}</small>
      </span></span>
      ${m.id === state.uid
        ? html`<span class="pill">${m.role === 'team' ? 'Team' : 'Fan'}</span>`
        : html`<select aria-label="Role" @change=${(e) => {
            if (e.target.value === 'remove') {
              if (confirm(`Remove ${label(m)}?`)) removeMember(m.id);
              else e.target.value = m.role;
            } else setMemberRole(m.id, e.target.value);
          }}>
            <option value="team" ?selected=${m.role === 'team'}>Team</option>
            <option value="fan" ?selected=${m.role === 'fan'}>Fan</option>
            <option value="remove">Remove…</option>
          </select>`}
    </div>`)}
  </section>`;
}
