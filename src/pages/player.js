import { html, nothing } from 'lit-html';
import { findGame, findPlayer, injuryOf, state } from '../store.js';
import { isTeam, myPlayerId } from '../auth.js';
import { updatePlayer } from '../actions.js';
import { playerAwards } from '../awards.js';
import {
  AVG_LABELS,
  SHOOTING,
  STAT_KEYS,
  STAT_NAMES,
  careerHighs,
  finalStats,
  fmtAvg,
  fmtPct,
  fmtStat,
  gameLog,
  lineText,
  playerLine,
} from '../stats.js';
import { badgeProgress, earnedBadges } from '../badges.js';
import { avatar, backLink, icon, injuryLabel, injuryPill, rerender, resultPill } from '../ui.js';
import { fmtDate } from '../util.js';
import { injuryItem, openInjurySheet } from './injuries.js';
import { badgeRow, openBadgeSheet } from './parts.js';

export const meta = { tab: 'players' };

const MAX_ARCHETYPE = 60;
let editing = false;

export function enter() {
  editing = false;
}

export function view([id]) {
  const player = findPlayer(id);
  if (!player) return html`${backLink('#/players', 'Players')}<section class="card"><p>Player not found.</p></section>`;
  const done = finalStats(state.games, state.stats);
  const line = playerLine(id, done);
  const injury = injuryOf(id);
  return html`
    ${backLink('#/players', 'Players')}
    <section class="card">
      <div class="profile">
        ${avatar(player.name, 'lg')}
        <div class="grow">
          <h1>${player.name}</h1>
          <div class="row">
            ${myPlayerId() === id ? html`<span class="pill">That's you</span>` : nothing}
            ${player.active === false ? html`<span class="pill">Inactive</span>` : nothing}
            ${injuryPill(injury)}
          </div>
        </div>
      </div>
      ${injury
        ? html`<p class="muted">${injuryLabel(injury.status)}${injury.note ? `: ${injury.note}` : ''}${injury.expectedReturn ? ` · expected back ${fmtDate(injury.expectedReturn)}` : ''}</p>`
        : nothing}
      ${archetype(player)}
    </section>
    <section class="card">
      <div class="card-head"><h2>Season</h2><small class="muted">${line.gp} ${line.gp === 1 ? 'game' : 'games'}</small></div>
      ${line.gp ? tiles(line) : html`<p class="muted">Hasn't played a game yet.</p>`}
    </section>
    ${badgesCard(badgeProgress(id, done))}
    ${highsCard(careerHighs(id, done, state.games))}
    ${awardsCard(playerAwards(id, state.games, state.categories, state.votes))}
    ${logCard(gameLog(id, state.stats, state.games))}
    ${injuryHistory(player)}`;
}

function archetype(player) {
  if (editing) {
    return html`<form class="stack" @submit=${(e) => {
      e.preventDefault();
      const value = String(new FormData(e.currentTarget).get('archetype')).trim().slice(0, MAX_ARCHETYPE);
      updatePlayer(player.id, { archetype: value });
      editing = false;
      rerender();
    }}>
      <label>Archetype<input name="archetype" maxlength=${MAX_ARCHETYPE} value=${player.archetype ?? ''} placeholder='e.g. "Michael Jordan"' autocomplete="off" /></label>
      <div class="row">
        <button class="btn sm">Save</button>
        <button type="button" class="btn sm secondary" @click=${() => { editing = false; rerender(); }}>Cancel</button>
      </div>
    </form>`;
  }
  return html`<div class="between">
    <div class="grow"><small class="muted">Archetype</small><span>${player.archetype || html`<span class="muted">—</span>`}</span></div>
    ${isTeam() ? html`<button class="btn ghost sm" @click=${() => { editing = true; rerender(); }}>${icon('edit')}Edit</button>` : nothing}
  </div>`;
}

const tile = (label, value, hint) => html`<div class="tile"><small class="muted">${label}</small><strong>${value}</strong><span class="hint">${hint}</span></div>`;

// Season averages with shooting right after points, and minutes (tracked the
// least) last. Stats nobody has tracked for this player are left out instead
// of showing a row of dashes.
const TILE_ORDER = ['points', ...SHOOTING.map((s) => s.key), ...STAT_KEYS.filter((k) => k !== 'points' && k !== 'minutes'), 'minutes'];

function tiles(line) {
  const shown = TILE_ORDER.flatMap((k) => {
    const shot = SHOOTING.find((s) => s.key === k);
    if (shot) {
      const s = line.shots[k];
      return s.games ? [tile(shot.pct, fmtPct(s.pct), `${s.made}/${s.att}`)] : [];
    }
    if (k !== 'points' && line.tracked[k] === 0) return [];
    const hint = line.tracked[k] < line.gp ? `${line.tracked[k]} of ${line.gp} games` : `${fmtStat(line.total[k], k)} total`;
    return [tile(AVG_LABELS[k], fmtAvg(line.avg[k], k), hint)];
  });
  return html`<div class="tiles">${shown}</div>`;
}

function badgesCard(progress) {
  const earned = earnedBadges(progress);
  return html`<section class="card">
    <div class="card-head">
      <h2>Badges <small class="muted">${earned.length} of ${progress.length}</small></h2>
      <button class="link" @click=${() => openBadgeSheet(progress)}>How to earn</button>
    </div>
    ${earned.length
      ? html`<ul class="list">${earned.map(badgeRow)}</ul>`
      : html`<p class="muted">No badges yet. They're earned from season stats, so they show up as games get played.</p>`}
  </section>`;
}

// Turnovers are left out: a high there isn't something to show off.
function highsCard(highs) {
  const keys = STAT_KEYS.filter((k) => k !== 'turnovers' && highs[k]?.value > 0 && findGame(highs[k].gameId));
  if (!keys.length) return nothing;
  return html`<section class="card flush">
    <div class="card-head"><h2>Career highs</h2></div>
    <ul class="list">
      ${keys.map((k) => {
        const g = findGame(highs[k].gameId);
        return html`<li><a class="row-link" href="#/games/${g.id}">
          <span class="grow"><strong>${fmtStat(highs[k].value, k)} ${STAT_NAMES[k].toLowerCase()}</strong><small class="muted">vs ${g.opponent} · ${fmtDate(g.date)}</small></span>
          ${icon('chevron', 'chev')}
        </a></li>`;
      })}
    </ul>
  </section>`;
}

const awardsCard = (awards) =>
  awards.length
    ? html`<section class="card">
        <h2>Awards</h2>
        <div class="row">${awards.map((a) => html`<span class="pill gold">🏆 ${a.category.name}${a.count > 1 ? ` ×${a.count}` : ''}</span>`)}</div>
      </section>`
    : nothing;

const logCard = (log) =>
  log.length
    ? html`<section class="card">
        <h2>Game log</h2>
        <div>
          ${log.map(({ game, line }) => html`<a class="log-row plain" href="#/games/${game.id}">
            <span class="log-top">
              ${resultPill(game)}
              <strong class="ellipsis">vs ${game.opponent}</strong>
              <small class="muted">${game.teamScore}–${game.opponentScore} · ${fmtDate(game.date, { weekday: false })}</small>
            </span>
            <small class="muted">${lineText(line) || 'No stats tracked'}</small>
          </a>`)}
        </div>
      </section>`
    : nothing;

function injuryHistory(player) {
  const all = state.injuries.filter((i) => i.playerId === player.id).sort((a, b) => (b.since || '').localeCompare(a.since || ''));
  if (!all.length && !isTeam()) return nothing;
  const current = injuryOf(player.id);
  return html`<section class="card">
    <div class="card-head">
      <h2>Injuries</h2>
      ${isTeam() && !current ? html`<button class="btn ghost sm" @click=${() => openInjurySheet(null, player.id)}>Report injury</button>` : nothing}
    </div>
    ${all.length ? all.map((i) => injuryItem(i)) : html`<p class="muted">No injuries reported.</p>`}
  </section>`;
}
