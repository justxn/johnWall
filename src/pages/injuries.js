import { html, nothing } from 'lit-html';
import { activeInjuries, activePlayers, findPlayer, injuryOf, state } from '../store.js';
import { isTeam, myPlayerId } from '../auth.js';
import { clearInjury, deleteInjury, saveInjury } from '../actions.js';
import { INJURY_STATUSES, closeSheet, icon, injuryLabel, injuryPill, openSheet, rerender, toast } from '../ui.js';
import { fmtDate, todayISO } from '../util.js';
import { playerTabs } from './players.js';

export const meta = { tab: 'players' };

const severity = (i) => INJURY_STATUSES.indexOf(i.status);

export function view() {
  const current = activeInjuries().sort((a, b) => severity(a) - severity(b));
  const past = state.injuries.filter((i) => i.clearedOn).sort((a, b) => b.clearedOn.localeCompare(a.clearedOn));
  return html`
    <h1>Players</h1>
    ${playerTabs('injuries')}
    <section class="card">
      <div class="card-head">
        <h2>Injury report</h2>
        ${isTeam() ? html`<button class="btn sm" @click=${() => openInjurySheet()}>Report injury</button>` : nothing}
      </div>
      ${current.length ? current.map((i) => injuryItem(i)) : html`<p class="muted">Nobody's hurt. Everyone's good to go 💪</p>`}
    </section>
    ${past.length ? html`<section class="card"><h2>Recovered</h2>${past.map((i) => injuryItem(i))}</section>` : nothing}`;
}

export function injuryItem(injury) {
  const player = findPlayer(injury.playerId);
  const healed = Boolean(injury.clearedOn);
  const details = healed
    ? [`Was ${injuryLabel(injury.status).toLowerCase()} from ${fmtDate(injury.since)}`, `back ${fmtDate(injury.clearedOn)}`]
    : [`Since ${fmtDate(injury.since)}`, injury.expectedReturn ? `expected back ${fmtDate(injury.expectedReturn)}` : ''];
  return html`<div class="injury">
    <a class="plain row" href="#/players/${injury.playerId}"><strong>${player?.name ?? 'Unknown'}</strong>${healed ? nothing : injuryPill(injury)}</a>
    ${injury.note ? html`<p>${injury.note}</p>` : nothing}
    <small class="muted">${details.filter(Boolean).join(' · ')}</small>
    ${isTeam() && !healed
      ? html`<div class="row">
          <button class="btn secondary sm" @click=${() => {
            clearInjury(injury.id, todayISO());
            toast(`${player?.name ?? 'Player'} is cleared to play`);
          }}>${icon('check')}Mark healthy</button>
          <button class="btn ghost sm" @click=${() => openInjurySheet(injury)}>Update</button>
        </div>`
      : nothing}
  </div>`;
}

let formError = '';

// `injury` to update one; otherwise a new report, optionally for a given player.
export function openInjurySheet(injury = null, playerId = null) {
  formError = '';
  openSheet(() => injuryForm(injury, playerId), { title: injury ? 'Update injury' : 'Report an injury' });
}

function injuryForm(injury, presetPlayer) {
  const preset = injury?.playerId ?? presetPlayer ?? myPlayerId() ?? '';
  return html`<form class="stack" novalidate @submit=${(e) => submit(e, injury)}>
    ${injury
      ? html`<p><strong>${findPlayer(injury.playerId)?.name ?? 'Unknown'}</strong></p>`
      : html`<label>Player
          <select name="playerId">
            <option value="" ?selected=${!preset}>Choose…</option>
            ${activePlayers().map((p) => html`<option value=${p.id} ?selected=${p.id === preset}>${p.name}</option>`)}
          </select>
        </label>`}
    <label>Status
      <select name="status">
        ${INJURY_STATUSES.map((s) => html`<option value=${s} ?selected=${(injury?.status ?? 'questionable') === s}>${injuryLabel(s)}</option>`)}
      </select>
    </label>
    <label>What happened? <span class="hint">Optional. Anyone with the link can see this.</span>
      <input name="note" value=${injury?.note ?? ''} placeholder="e.g. rolled ankle" maxlength="80" autocomplete="off" />
    </label>
    <div class="grid2">
      <label>Since<input type="date" name="since" value=${injury?.since ?? todayISO()} /></label>
      <label>Expected back<input type="date" name="expectedReturn" value=${injury?.expectedReturn ?? ''} /></label>
    </div>
    ${formError ? html`<p class="err">${formError}</p>` : nothing}
    <button class="btn block">Save</button>
    ${injury
      ? html`<button type="button" class="btn danger-ghost" @click=${() => {
          if (!confirm('Delete this entry from the injury report?')) return;
          deleteInjury(injury.id);
          closeSheet();
        }}>Delete entry</button>`
      : nothing}
  </form>`;
}

function submit(e, injury) {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  const playerId = injury?.playerId ?? String(fd.get('playerId') || '');
  if (!playerId) {
    formError = 'Pick a player.';
    return rerender();
  }
  // One open entry per player: reporting again updates the current one.
  const id = injury?.id ?? injuryOf(playerId)?.id ?? null;
  saveInjury(id, {
    playerId,
    status: String(fd.get('status')),
    note: String(fd.get('note')).trim(),
    since: String(fd.get('since')) || todayISO(),
    expectedReturn: String(fd.get('expectedReturn')),
    clearedOn: null,
  });
  closeSheet();
  toast('Injury report updated');
}
