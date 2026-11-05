// The sportsbook on a game's page: the props board for upcoming games, the
// bet slip, and the bets on a game with live progress and results. Coins are
// in-app only.
import { html, nothing } from 'lit-html';
import { findGame, findPlayer, gameBets, gameLines, gameStats, sortedPlayers, state } from '../store.js';
import { isMember, isTeam, myName, myPlayerId, voterKey } from '../auth.js';
import { cancelBet, placeBet, setLine } from '../actions.js';
import {
  MAX_STAKE,
  MIN_GAMES,
  PROP_LABELS,
  PROP_STATS,
  betProblem,
  bettingOpen,
  coinsOf,
  grade,
  ledger,
  pickLabel,
  winsWith,
} from '../book.js';
import { fmtStat, statusOf } from '../stats.js';
import { closeSheet, openSheet, rerender, toast } from '../ui.js';

let stat = 'points'; // the board's chosen stat
let editing = false; // a team member moving lines

export const coinBook = () => ledger(state.bets, state.games, state.stats);
export const myCoins = () => coinsOf(coinBook(), voterKey());

// Bets are placed as your player when you're on the team (like votes), and as
// yourself otherwise.
function me() {
  const name = findPlayer(myPlayerId())?.name || myName() || (isTeam() ? 'Team' : 'Fan');
  return { bettorId: voterKey(), bettorName: name.slice(0, 60) };
}

// Who placed a bet: the player's current name for players, else the name on the bet.
export const bettorName = (bet) => findPlayer(bet.bettorId)?.name ?? bet.bettorName;

const lineText = (l) => `o/u ${l.stat === 'plusMinus' && l.line > 0 ? '+' : ''}${l.line}`;
const playerName = (id) => findPlayer(id)?.name ?? 'Unknown';
const coins = (n) => n.toLocaleString();

// --- Props board (upcoming games) -------------------------------------------

export function propsCard(game) {
  const open = bettingOpen(game);
  const lines = gameLines(game.id).filter((l) => editing || !l.pulled);
  const stats = PROP_STATS.filter((k) => lines.some((l) => l.stat === k));
  const shownStat = stats.includes(stat) ? stat : stats[0];
  const rows = lines.filter((l) => l.stat === shownStat).sort((a, b) => playerName(a.playerId).localeCompare(playerName(b.playerId)));
  const canEdit = isTeam() && open;
  return html`<section class="card">
    <div class="card-head">
      <h2>Props</h2>
      ${canEdit ? html`<button class="link" @click=${() => { editing = !editing; rerender(); }}>${editing ? 'Done' : 'Edit lines'}</button>` : nothing}
    </div>
    ${intro(open)}
    ${stats.length > 1
      ? html`<div class="chips" role="tablist" aria-label="Prop">
          ${stats.map((k) => html`<button role="tab" class="chip ${k === shownStat ? 'on' : ''}" aria-selected=${k === shownStat ? 'true' : 'false'}
            @click=${() => { stat = k; rerender(); }}>${PROP_LABELS[k]}</button>`)}
        </div>`
      : nothing}
    ${rows.length
      ? html`<ul class="list">${rows.map((l) => (editing && canEdit ? editRow(game, l) : propRow(game, l, open)))}</ul>`
      : html`<p class="muted">No lines yet. Players get one for each stat once they have ${MIN_GAMES} games of it${canEdit ? ', and you can add your own' : ''}.</p>`}
    ${editing && canEdit ? addProp(game) : nothing}
  </section>`;
}

function intro(open) {
  if (!open) return html`<p class="muted">Betting is closed for this game.</p>`;
  if (!isMember()) return html`<p class="muted">Bet on players with in-app coins (no real money). <a href="#/join">Join</a> to bet.</p>`;
  return html`<p class="muted">You have <b>${coins(myCoins().available)}</b> coins. Pick over or under: it pays even money, up to ${MAX_STAKE} a bet.</p>`;
}

function propRow(game, line, open) {
  const name = playerName(line.playerId);
  const canBet = open && isMember();
  const mine = line.playerId === myPlayerId();
  return html`<li class="prop-row">
    <span class="grow"><strong class="ellipsis">${name}</strong><small class="muted">${PROP_LABELS[line.stat]} ${lineText(line)}</small></span>
    <button class="btn sm secondary" aria-label="${name} over ${line.line}" ?disabled=${!canBet} @click=${() => openBetSlip(game, line, 'over')}>Over</button>
    <button class="btn sm secondary" aria-label="${name} under ${line.line}" ?disabled=${!canBet || mine} title=${mine ? "You can't bet the under on yourself" : ''}
      @click=${() => openBetSlip(game, line, 'under')}>Under</button>
  </li>`;
}

// Team members move a line by half a point at a time (which makes it a
// hand-set line), pull a prop, or put a pulled one back on the averages.
function editRow(game, line) {
  const name = playerName(line.playerId);
  const lowest = line.stat === 'plusMinus' ? -50 : 0.5;
  return html`<li class="prop-row">
    <span class="grow"><strong class="ellipsis">${name}</strong><small class="muted">${line.pulled ? 'Pulled' : line.auto ? 'From averages' : 'Set by hand'}</small></span>
    ${line.pulled
      ? html`<button class="btn sm secondary" @click=${() => setLine(game.id, line, { pulled: false, auto: true })}>Put back</button>`
      : html`<span class="stepper">
          <button class="btn sm secondary" aria-label="Lower ${name}'s line" ?disabled=${line.line - 0.5 < lowest} @click=${() => setLine(game.id, line, { line: line.line - 0.5 })}>−</button>
          <b>${line.line}</b>
          <button class="btn sm secondary" aria-label="Raise ${name}'s line" @click=${() => setLine(game.id, line, { line: line.line + 0.5 })}>+</button>
        </span>
        <button class="btn sm danger-ghost" @click=${() => setLine(game.id, line, { pulled: true })}>Pull</button>`}
  </li>`;
}

// A prop by hand, for players without enough games for an automatic line.
function addProp(game) {
  return html`<form class="add-prop" novalidate @submit=${(e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const playerId = String(fd.get('player'));
    const k = String(fd.get('stat'));
    const line = Number(String(fd.get('line')).trim());
    if (!playerId || !Number.isFinite(line) || (k !== 'plusMinus' && line < 0)) return toast('Pick a player and a line.', 'error');
    setLine(game.id, { playerId, stat: k }, { line });
    stat = k;
    e.currentTarget.reset();
  }}>
    <strong>Add a prop</strong>
    <div class="grid2">
      <label>Player<select name="player">${sortedPlayers().filter((p) => p.active !== false).map((p) => html`<option value=${p.id}>${p.name}</option>`)}</select></label>
      <label>Stat<select name="stat">${PROP_STATS.map((k) => html`<option value=${k} ?selected=${k === stat}>${PROP_LABELS[k]}</option>`)}</select></label>
    </div>
    <div class="row"><label class="grow">Line<input name="line" inputmode="decimal" placeholder="e.g. 6.5" autocomplete="off" /></label><button class="btn">Post</button></div>
  </form>`;
}

// --- Bet slip -----------------------------------------------------------------

let slip = null; // { gameId, lineId, side, stake, error }

export function openBetSlip(game, line, side) {
  slip = { gameId: game.id, lineId: line.id, side, stake: 25, error: '' };
  openSheet(slipView, { title: 'Bet slip' });
}

function slipView() {
  const line = gameLines(slip.gameId).find((l) => l.id === slip.lineId);
  if (!line) return html`<p class="muted">This prop was taken down.</p>`;
  const pick = { stat: line.stat, side: slip.side, line: line.line }; // the posted line, in case it moved
  const { available } = myCoins();
  const pickStake = (n) => {
    slip.stake = n;
    slip.error = '';
    rerender();
  };
  return html`<div class="stack">
    <div>
      <strong class="vs">${playerName(line.playerId)} · ${pickLabel(pick)}</strong>
      <p class="muted">Wins with ${winsWith(pick)}. Pays even money.</p>
    </div>
    <div class="chips wrap">
      ${[10, 25, 50, 100, MAX_STAKE].map((n) => html`<button type="button" class="chip ${slip.stake === n ? 'on' : ''}" ?disabled=${n > available} @click=${() => pickStake(n)}>${n}</button>`)}
    </div>
    <label>Coins<input inputmode="numeric" pattern="[0-9]*" autocomplete="off" .value=${slip.stake ? String(slip.stake) : ''}
      @input=${(e) => pickStake(Number.parseInt(e.target.value, 10) || 0)} /></label>
    <p class="muted">To win <b>${coins(slip.stake || 0)}</b> · you have ${coins(available)} coins</p>
    ${slip.error ? html`<p class="err">${slip.error}</p>` : nothing}
    <button class="btn block" @click=${submitSlip}>Place bet</button>
  </div>`;
}

function submitSlip() {
  const game = findGame(slip.gameId);
  const line = gameLines(slip.gameId).find((l) => l.id === slip.lineId);
  if (!game || !line || line.pulled || !bettingOpen(game)) {
    slip.error = 'This prop is closed.';
    return rerender();
  }
  const bet = { playerId: line.playerId, stat: line.stat, side: slip.side, line: line.line, stake: slip.stake };
  const problem = betProblem(bet, { available: myCoins().available, myPlayerId: myPlayerId() });
  if (problem) {
    slip.error = problem;
    return rerender();
  }
  placeBet(game.id, { ...me(), ...bet });
  closeSheet();
  toast(`Bet placed: ${playerName(bet.playerId)} ${pickLabel(bet)} for ${bet.stake}`);
}

// --- Bets on a game -----------------------------------------------------------

export function betsCard(game) {
  const bets = gameBets(game.id).sort((a, b) => (b.placedAt ?? 0) - (a.placedAt ?? 0));
  if (!bets.length) return nothing;
  const status = statusOf(game);
  const lines = new Map(gameStats(game.id).map((s) => [s.playerId, s]));
  return html`<section class="card">
    <div class="card-head"><h2>Bets</h2><small class="muted">${bets.length}</small></div>
    <ul class="list">${bets.map((bet) => betRow(game, bet, status, lines.get(bet.playerId)))}</ul>
  </section>`;
}

// The right side shows a result once the game is final, the stat so far while
// it's live (green while the bet is winning), and Cancel on your own bets
// before tip-off.
function betRow(game, bet, status, statLine) {
  let side = nothing;
  if (status === 'final') side = resultPill(grade(bet, statLine), bet.stake);
  else if (status === 'live') {
    const value = statLine?.[bet.stat];
    const winning = value != null && (bet.side === 'over' ? value > bet.line : value < bet.line);
    side = html`<span class="pill ${winning ? 'win' : ''}">${value == null ? '—' : fmtStat(value, bet.stat)} so far</span>`;
  } else if (bet.bettorId === voterKey() && isMember() && bettingOpen(game)) {
    side = html`<button class="btn sm danger-ghost" @click=${() => confirm('Cancel this bet? You get the coins back.') && cancelBet(bet)}>Cancel</button>`;
  }
  return html`<li class="bet-row">
    <span class="grow">
      <strong>${playerName(bet.playerId)} · ${pickLabel(bet)}</strong>
      <small class="muted">${bettorName(bet)} · ${coins(bet.stake)} coins</small>
    </span>
    ${side}
  </li>`;
}

export function resultPill(result, stake) {
  if (result === 'won') return html`<span class="pill win">+${coins(stake)}</span>`;
  if (result === 'lost') return html`<span class="pill loss">−${coins(stake)}</span>`;
  return html`<span class="pill">${result === 'push' ? 'Push' : 'Void'}</span>`;
}
