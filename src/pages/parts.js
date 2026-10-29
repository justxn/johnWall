// Pieces shared by more than one page.
import { html, nothing } from 'lit-html';
import { activeInjuries, findPlayer, gameStats, state, teamName } from '../store.js';
import { STAT_KEYS, STAT_LABELS, fmtStat, headToHead, resultOf } from '../stats.js';
import { playedMs } from '../live.js';
import { injuryPill } from '../ui.js';
import { playerName } from '../util.js';

// "1–0 vs them · last: W 21–18", or "First meeting".
export function h2hLine(opponent, { excludeId } = {}) {
  const h = headToHead(state.games.filter((g) => g.id !== excludeId), opponent);
  if (!h.games.length) return 'First meeting';
  const last = h.games[0];
  return `${h.wins}–${h.losses} vs them · last time ${resultOf(last)} ${last.teamScore}–${last.opponentScore}`;
}

// "Injuries: Jalen (Questionable)" for anyone on the roster who's hurt.
export function injuryNote() {
  const hurt = activeInjuries().filter((i) => state.players.some((p) => p.id === i.playerId && p.active !== false));
  if (!hurt.length) return nothing;
  return html`<small class="muted">Injuries: ${hurt.map((i, n) => html`${n ? ', ' : ''}${playerName(state.players, i.playerId)} ${injuryPill(i)}`)}</small>`;
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
