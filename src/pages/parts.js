// Pieces shared by more than one page.
import { html, nothing } from 'lit-html';
import { activePlayers, findPlayer, gameRsvps, gameStats, injuryOf, state, teamName } from '../store.js';
import { isTeam, myPlayerId } from '../auth.js';
import { setRsvp } from '../actions.js';
import { STAT_KEYS, STAT_LABELS, fmtStat, headToHead, resultOf } from '../stats.js';
import { playedMs } from '../live.js';
import { icon, injuryPill } from '../ui.js';

export const NEEDED = 3; // it's 3v3

const RSVP_LABELS = { in: 'In', maybe: 'Maybe', out: 'Out' };

export const rsvpCount = (game, status = 'in') => gameRsvps(game.id).filter((r) => r.status === status).length;

export function rsvpSummary(game) {
  const n = rsvpCount(game);
  const maybe = rsvpCount(game, 'maybe');
  const ok = n >= NEEDED;
  const text = ok
    ? `${n} in, enough to play`
    : n === 0
      ? 'Nobody has said they\'re in yet'
      : `${n} of ${NEEDED} in, need ${NEEDED - n} more`;
  return html`<div class="rsvp-bar ${ok ? 'full' : 'short'}">
    ${icon(ok ? 'check' : 'players')}<span>${text}${maybe ? html` <span class="muted">· ${maybe} maybe</span>` : nothing}</span>
  </div>`;
}

// In / Maybe / Out buttons for the player linked to this device.
export function myRsvp(game) {
  const pid = myPlayerId();
  if (!pid) return nothing;
  const mine = gameRsvps(game.id).find((r) => r.playerId === pid)?.status;
  const btn = (status) => html`<button
    type="button"
    class="${status} ${mine === status ? 'on' : ''}"
    aria-pressed=${mine === status ? 'true' : 'false'}
    @click=${() => setRsvp(game.id, pid, mine === status ? null : status)}
  >${RSVP_LABELS[status]}</button>`;
  return html`<div class="field"><span>Are you in?</span><div class="rsvp-choice">${btn('in')}${btn('maybe')}${btn('out')}</div></div>`;
}

// Everyone's answer. Team members can set it for anyone (e.g. "Marcus texted me").
export function rsvpList(game) {
  const answers = new Map(gameRsvps(game.id).map((r) => [r.playerId, r.status]));
  const order = { in: 0, maybe: 1, out: 2, none: 3 };
  const rank = (id) => order[answers.get(id) ?? 'none'];
  const players = activePlayers().sort((a, b) => rank(a.id) - rank(b.id));
  if (!players.length) return html`<p class="muted">No players on the roster yet.</p>`;
  return html`<div class="rsvp-list">
    ${players.map((p) => {
      const status = answers.get(p.id);
      return html`<div class="rsvp-row">
        <span class="name"><a class="ellipsis" href="#/players/${p.id}">${p.name}</a>${injuryPill(injuryOf(p.id))}</span>
        ${isTeam()
          ? html`<select aria-label="${p.name}'s answer" @change=${(e) => setRsvp(game.id, p.id, e.target.value || null)}>
              <option value="" ?selected=${!status}>No reply</option>
              ${Object.entries(RSVP_LABELS).map(([v, label]) => html`<option value=${v} ?selected=${status === v}>${label}</option>`)}
            </select>`
          : html`<span class="pill ${status === 'in' ? 'win' : status === 'out' ? 'loss' : status === 'maybe' ? 'gold' : ''}">${RSVP_LABELS[status] || 'No reply'}</span>`}
      </div>`;
    })}
  </div>`;
}

// "1–0 vs them · last: W 21–18", or "First meeting".
export function h2hLine(opponent, { excludeId } = {}) {
  const h = headToHead(state.games.filter((g) => g.id !== excludeId), opponent);
  if (!h.games.length) return 'First meeting';
  const last = h.games[0];
  return `${h.wins}–${h.losses} vs them · last time ${resultOf(last)} ${last.teamScore}–${last.opponentScore}`;
}

// Box score table, best scorer first, with a totals row. While a game is live,
// minutes come from the game clock.
export function boxScore(game) {
  const live = game.status === 'live' ? game.live : null;
  const rows = gameStats(game.id)
    .map((s) => ({ ...s, name: findPlayer(s.playerId)?.name ?? 'Unknown' }))
    .map((s) => (live?.tracked?.includes('minutes') ? { ...s, minutes: Math.floor(playedMs(live, s.playerId) / 60000) } : s))
    .sort((a, b) => (b.points ?? -1) - (a.points ?? -1) || a.name.localeCompare(b.name));
  if (!rows.length) return null;
  const keys = STAT_KEYS.filter((k) => rows.some((r) => r[k] != null));
  const total = (k) => (rows.some((r) => r[k] != null) ? rows.reduce((n, r) => n + (r[k] ?? 0), 0) : null);
  return html`<div class="scroll"><table class="box">
    <thead><tr><th scope="col">Player</th>${keys.map((k) => html`<th scope="col">${STAT_LABELS[k]}</th>`)}</tr></thead>
    <tbody>${rows.map((r) => html`<tr>
      <td><a href="#/players/${r.playerId}">${r.name}</a></td>${keys.map((k) => html`<td>${fmtStat(r[k])}</td>`)}
    </tr>`)}</tbody>
    <tfoot><tr><td>${teamName()}</td>${keys.map((k) => html`<td>${fmtStat(total(k))}</td>`)}</tr></tfoot>
  </table></div>
  ${rows.some((r) => keys.some((k) => r[k] == null)) ? html`<small class="muted">— = not tracked</small>` : nothing}`;
}
