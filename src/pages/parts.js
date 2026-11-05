// Pieces shared by more than one page.
import { html, nothing } from 'lit-html';
import { activeInjuries, findPlayer, gameStats, state, teamName } from '../store.js';
import { SHOOTING, STAT_KEYS, STAT_LABELS, fmtShots, fmtStat, headToHead, resultOf } from '../stats.js';
import { playedMs } from '../live.js';
import { BADGES, TIERS, TIER_KEYS, cutoffs } from '../badges.js';
import { injuryPill, openSheet } from '../ui.js';
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
// minutes come from the game clock. Columns only show for stats someone has.
export function boxScore(game) {
  const live = game.status === 'live' ? game.live : null;
  const rows = gameStats(game.id)
    .map((s) => ({ ...s, name: findPlayer(s.playerId)?.name ?? 'Unknown' }))
    .map((s) => (live?.tracked?.includes('minutes') ? { ...s, minutes: Math.floor(playedMs(live, s.playerId) / 60000) } : s))
    .sort((a, b) => (b.points ?? -1) - (a.points ?? -1) || a.name.localeCompare(b.name));
  if (!rows.length) return null;
  const sum = (k) => (rows.some((r) => r[k] != null) ? rows.reduce((n, r) => n + (r[k] ?? 0), 0) : null);
  const statCol = (k) => ({
    label: STAT_LABELS[k],
    cell: (r) => fmtStat(r[k], k),
    blank: (r) => r[k] == null,
    // Everyone on the court shares each basket's plus-minus, so it has no team total.
    total: () => (k === 'plusMinus' ? '' : fmtStat(sum(k))),
  });
  const shotCol = (s) => ({
    label: s.label,
    cell: (r) => fmtShots(r[s.made], r[s.att]),
    blank: (r) => r[s.att] == null,
    total: () => fmtShots(sum(s.made), sum(s.att)),
  });
  const keys = STAT_KEYS.filter((k) => rows.some((r) => r[k] != null));
  // Shooting goes right after points.
  const cols = [
    ...keys.filter((k) => k === 'points').map(statCol),
    ...SHOOTING.filter((s) => rows.some((r) => r[s.att] != null)).map(shotCol),
    ...keys.filter((k) => k !== 'points').map(statCol),
  ];
  return html`<div class="scroll"><table class="box">
    <thead><tr><th scope="col">Player</th>${cols.map((c) => html`<th scope="col">${c.label}</th>`)}</tr></thead>
    <tbody>${rows.map((r) => html`<tr>
      <td><a href="#/players/${r.playerId}">${r.name}</a></td>${cols.map((c) => html`<td>${c.cell(r)}</td>`)}
    </tr>`)}</tbody>
    <tfoot><tr><td>${teamName()}</td>${cols.map((c) => html`<td>${c.total()}</td>`)}</tr></tfoot>
  </table></div>
  ${rows.some((r) => cols.some((c) => c.blank(r))) ? html`<small class="muted">— = not tracked</small>` : nothing}`;
}

// --- Badges -----------------------------------------------------------------

// A badge's icon in a ring of its tier's colour: no tier given is plain, -1 is
// not earned yet (greyed out).
export const medal = (badge, tier) =>
  html`<span class="medal ${tier == null ? '' : tier < 0 ? 'locked' : `tier-${TIER_KEYS[tier]}`}" aria-hidden="true">${badge.icon}</span>`;

export const tierPill = (tier, text = TIERS[tier]) => html`<span class="pill tier-${TIER_KEYS[tier]}">${text}</span>`;

// An earned badge: where the player is now and what the next tier takes.
export const badgeRow = ({ badge, value, tier, next }) => html`<li class="badge-row">
  ${medal(badge, tier)}
  <span class="grow">
    <strong>${badge.name}</strong>
    <small class="muted">${badge.show(value)} · ${next == null ? 'top tier' : `${TIERS[tier + 1]} at ${badge.cutoff(next)}`}</small>
  </span>
  ${tierPill(tier)}
</li>`;

// Every badge and what each tier takes. Given a player's progress (from
// badgeProgress), it also shows where they are on each one.
export function openBadgeSheet(progress = null) {
  openSheet(
    () => html`<p class="muted">Badges are earned from stats in finished games, so they move with the season. Each has four tiers: Bronze, Silver, Gold and Hall of Fame.</p>
      <ul class="list">
        ${BADGES.map((badge, i) => {
          const p = progress?.[i];
          return html`<li class="badge-row">
            ${medal(badge, p?.tier)}
            <span class="grow">
              <strong>${badge.name}</strong>
              <small class="muted">${badge.about}</small>
              <small class="muted">${cutoffs(badge)}</small>
              ${p ? html`<small>${p.value != null ? `Now: ${badge.show(p.value)}` : p.need || 'Not tracked yet'}</small>` : nothing}
            </span>
            ${p && p.tier >= 0 ? tierPill(p.tier) : nothing}
          </li>`;
        })}
      </ul>`,
    { title: 'How to earn badges' },
  );
}
