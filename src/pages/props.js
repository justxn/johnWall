// Sportsbook pieces shared by the Book tab and a game's page: the props board,
// the bet slip and bet rows. Coins are in-app only.
import { html, nothing } from 'lit-html';
import { findGame, findPlayer, gameBets, gameLines, sortedPlayers, state } from '../store.js';
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
  fmtCoins,
  grade,
  ledger,
  liveStatus,
  pickLabel,
  winsWith,
} from '../book.js';
import { finalStats, fmtAvg, fmtStat, gameLog, playerLine, statusOf } from '../stats.js';
import { avatar, closeSheet, openSheet, rerender, toast, when } from '../ui.js';
import { timeLeft } from '../util.js';

let stat = 'points'; // the board's chosen stat, shared by every board
let editing = false; // a team member moving lines

export const coinBook = () => ledger(state.bets, state.games, state.stats);
export const myCoins = () => coinsOf(coinBook(), voterKey());

// The line every sportsbook carries. The coins here are play money, but the
// helpline is real (the National Problem Gambling Helpline).
export const helpLine = () =>
  html`<p class="help-line">Gambling problem? Call <a href="tel:+18004262537">1-800-GAMBLER</a>.</p>`;

// Bets are placed as your player when you're on the team (like votes), and as
// yourself otherwise.
function me() {
  const name = findPlayer(myPlayerId())?.name || myName() || (isTeam() ? 'Team' : 'Fan');
  return { bettorId: voterKey(), bettorName: name.slice(0, 60) };
}

// Who placed a bet: the player's current name for players, else the name on the bet.
export const bettorName = (bet) => findPlayer(bet.bettorId)?.name ?? bet.bettorName ?? 'Fan';

const playerName = (id) => findPlayer(id)?.name ?? 'Unknown';
const lineValue = (l) => `${l.stat === 'plusMinus' && l.line > 0 ? '+' : ''}${l.line}`;

// "Closes in 5 hr", or null once betting is closed.
export function closesIn(game, now = Date.now()) {
  if (!bettingOpen(game, new Date(now))) return null;
  if (!game.date) return 'Closes at tip-off';
  return `Closes in ${timeLeft(new Date(`${game.date}T${game.time || '23:59'}`) - now)}`;
}

// --- Props board ----------------------------------------------------------------

// `header` adds the game's name and start time, for the Book tab (a game's
// page already says which game it is).
export function propsCard(game, { header = false } = {}) {
  const open = bettingOpen(game);
  const canEdit = isTeam() && open;
  const edit = editing && canEdit;
  const lines = gameLines(game.id).filter((l) => edit || !l.pulled);
  const stats = PROP_STATS.filter((k) => lines.some((l) => l.stat === k));
  const shown = stats.includes(stat) ? stat : stats[0];
  const rows = lines.filter((l) => l.stat === shown).sort((a, b) => playerName(a.playerId).localeCompare(playerName(b.playerId)));
  const editButton = canEdit ? html`<button class="link" @click=${() => { editing = !editing; rerender(); }}>${editing ? 'Done' : 'Edit lines'}</button>` : nothing;
  const done = finalStats(state.games, state.stats);
  return html`<section class="card board">
    ${header
      ? html`<div class="card-head">
          <div class="grow"><h2 class="ellipsis">vs ${game.opponent || 'TBD'}</h2><small class="muted">${[when(game), closesIn(game)].filter(Boolean).join(' · ')}</small></div>
          ${editButton}
        </div>`
      : html`<div class="card-head"><h2>Props</h2>${editButton}</div>`}
    ${intro(open, header)}
    ${stats.length > 1
      ? html`<div class="chips" role="tablist" aria-label="Prop">
          ${stats.map((k) => html`<button role="tab" class="chip ${k === shown ? 'on' : ''}" aria-selected=${k === shown ? 'true' : 'false'}
            @click=${() => { stat = k; rerender(); }}>${PROP_LABELS[k]}</button>`)}
        </div>`
      : nothing}
    ${rows.length
      ? html`<ul class="list">${rows.map((l) => (edit ? editRow(game, l) : propRow(game, l, open, done)))}</ul>`
      : html`<p class="muted">No lines yet. Players get one for each stat once they have ${MIN_GAMES} games of it${canEdit ? ', and you can add your own' : ''}.</p>`}
    ${edit ? addProp(game) : nothing}
    ${header ? nothing : helpLine()}
  </section>`;
}

// On the Book tab the wallet above already shows your coins.
function intro(open, onBook) {
  if (!open) return html`<p class="muted">Betting is closed for this game.</p>`;
  if (onBook) return html`<p class="muted">Every prop pays even money, up to ${MAX_STAKE} coins a bet.</p>`;
  if (!isMember()) return html`<p class="muted">Bet on players with in-app coins (no real money). <a href="#/join">Join</a> to bet.</p>`;
  return html`<p class="muted">Even money, up to ${MAX_STAKE} a bet. You have <b>${fmtCoins(myCoins().available)}</b> coins.</p>`;
}

// The player's season average and last game for this stat, to bet from.
function form(playerId, k, done) {
  const season = playerLine(playerId, done);
  const avg = k === 'fg3m' ? (season.shots.three.games ? season.shots.three.made / season.shots.three.games : null) : season.avg[k];
  const last = gameLog(playerId, done, state.games)[0]?.line[k];
  if (avg == null) return 'No games yet';
  return `Avg ${fmtAvg(avg, k)}${last != null ? ` · Last ${fmtStat(last, k)}` : ''}`;
}

function propRow(game, line, open, done) {
  const name = playerName(line.playerId);
  const canBet = open && isMember();
  const mine = line.playerId === myPlayerId();
  // Sides you already have a bet on are outlined.
  const me = isMember() ? voterKey() : null;
  const placed = new Set(gameBets(game.id).filter((b) => b.bettorId === me && b.playerId === line.playerId && b.stat === line.stat).map((b) => b.side));
  const side = (s) => {
    const blocked = s === 'under' && mine;
    return html`<button class="odds ${placed.has(s) ? 'placed' : ''}" aria-label="${name} ${s} ${lineValue(line)} ${PROP_LABELS[line.stat]}"
      title=${blocked ? "You can't bet the under on yourself" : ''} ?disabled=${!canBet || blocked} @click=${() => openBetSlip(game, line, s)}>
      <small>${s === 'over' ? 'Over' : 'Under'}</small><b>${lineValue(line)}</b>
    </button>`;
  };
  return html`<li class="prop">
    ${avatar(name, 'sm')}
    <span class="grow"><strong class="ellipsis">${name}</strong><small class="muted ellipsis">${form(line.playerId, line.stat, done)}</small></span>
    ${side('over')}${side('under')}
  </li>`;
}

// Team members move a line by half a point at a time (which makes it a
// hand-set line), pull a prop, or put a pulled one back on the averages.
function editRow(game, line) {
  const name = playerName(line.playerId);
  const lowest = line.stat === 'plusMinus' ? -50 : 0.5;
  return html`<li class="prop">
    <span class="grow"><strong class="ellipsis">${name}</strong><small class="muted">${line.pulled ? 'Pulled' : line.auto ? 'From averages' : 'Set by hand'}</small></span>
    ${line.pulled
      ? html`<button class="btn sm secondary" @click=${() => setLine(game.id, line, { pulled: false, auto: true })}>Put back</button>`
      : html`<span class="stepper">
          <button class="btn sm secondary" aria-label="Lower ${name}'s line" ?disabled=${line.line - 0.5 < lowest} @click=${() => setLine(game.id, line, { line: line.line - 0.5 })}>−</button>
          <b>${lineValue(line)}</b>
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
  slip = { gameId: game.id, lineId: line.id, side, stake: Math.min(25, myCoins().available), error: '' };
  openSheet(slipView, { title: 'Bet slip' });
}

function slipView() {
  const game = findGame(slip.gameId);
  const line = gameLines(slip.gameId).find((l) => l.id === slip.lineId);
  if (!game || !line || line.pulled) return html`<p class="muted">This prop was taken down.</p>`;
  const pick = { stat: line.stat, side: slip.side, line: line.line }; // the posted line, in case it moved
  const { available } = myCoins();
  const stake = slip.stake || 0;
  const max = Math.min(MAX_STAKE, available);
  const setStake = (n) => {
    slip.stake = n;
    slip.error = '';
    rerender();
  };
  const chip = (n, label = String(n)) =>
    html`<button type="button" class="chip ${stake === n ? 'on' : ''}" ?disabled=${n > available || n < 1} @click=${() => setStake(n)}>${label}</button>`;
  return html`<div class="stack">
    <div class="slip-pick">
      ${avatar(playerName(line.playerId))}
      <span class="grow">
        <strong>${playerName(line.playerId)}</strong>
        <span>${pickLabel(pick)}</span>
        <small class="muted ellipsis">vs ${game.opponent || 'TBD'} · ${when(game)}</small>
      </span>
      <span class="pill">Even</span>
    </div>
    <p class="muted">Wins with ${winsWith(pick)}.${Number.isInteger(pick.line) ? ` Exactly ${fmtStat(pick.line, pick.stat)} is a push.` : ''}
      If ${playerName(line.playerId)} sits out or it isn't tracked, you get your coins back.</p>
    <div class="chips wrap">${[10, 25, 50, 100].map((n) => chip(n))}${chip(max, `Max ${fmtCoins(max)}`)}</div>
    <label>Stake<input inputmode="numeric" pattern="[0-9]*" autocomplete="off" .value=${stake ? String(stake) : ''}
      @input=${(e) => setStake(Number.parseInt(e.target.value, 10) || 0)} /></label>
    <div class="slip-sum">
      <span><small>Stake</small><b>${fmtCoins(stake)}</b></span>
      <span><small>To win</small><b>${fmtCoins(stake)}</b></span>
      <span><small>Payout</small><b>${fmtCoins(stake * 2)}</b></span>
    </div>
    ${slip.error ? html`<p class="err">${slip.error}</p>` : nothing}
    <button class="btn block" ?disabled=${!stake} @click=${submitSlip}>Place bet${stake ? ` · ${fmtCoins(stake)}` : ''}</button>
    <p class="hint center">You have ${fmtCoins(available)} coins to bet. Coins are for fun and have no cash value.</p>
    ${helpLine()}
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
  toast(`Bet placed: ${playerName(bet.playerId)} ${pickLabel(bet)} for ${fmtCoins(bet.stake)}`);
}

// --- Bets ---------------------------------------------------------------------

// The bets on one game, for its page.
export function betsCard(game) {
  const bets = gameBets(game.id).sort((a, b) => (b.placedAt ?? 0) - (a.placedAt ?? 0));
  if (!bets.length) return nothing;
  return html`<section class="card flush">
    <div class="card-head"><h2>Bets</h2><small class="muted">${bets.length}</small></div>
    <ul class="list">${bets.map((bet) => betRow(bet, { bettor: true }))}</ul>
  </section>`;
}

// One bet. The right side shows the result once the game is final, the stat
// so far while it's live, and Cancel on your own bets before tip-off.
// `bettor` shows who placed it; `game` which game it's on.
export function betRow(bet, { bettor = false, game: showGame = false } = {}) {
  const game = findGame(bet.gameId);
  const status = statusOf(game);
  const statLine = state.stats.find((s) => s.gameId === bet.gameId && s.playerId === bet.playerId);
  const label = PROP_LABELS[bet.stat];
  let side = html`<span class="pill">Open</span>`;
  let below = nothing;
  if (status === 'final') {
    side = betResultPill(grade(bet, statLine), bet.stake);
    const value = statLine?.[bet.stat];
    below = html`<small class="muted">${value == null ? (statLine ? 'Not tracked' : "Didn't play") : `Finished with ${fmtStat(value, bet.stat)} ${label}`}</small>`;
  } else if (status === 'live') {
    const live = liveStatus(bet, statLine);
    side = html`<span class="pill ${live?.winning ? 'win' : 'live'}">Live</span>`;
    below = live ? progress(bet, live) : html`<small class="muted">Not tracked</small>`;
  } else if (bet.bettorId === voterKey() && isMember() && bettingOpen(game)) {
    side = html`<button class="btn sm danger-ghost" @click=${() => confirm('Cancel this bet? You get the coins back.') && cancelBet(bet)}>Cancel</button>`;
  }
  const details = [bettor ? bettorName(bet) : '', showGame ? `vs ${game.opponent || 'TBD'}` : '', `${fmtCoins(bet.stake)} to win ${fmtCoins(bet.stake)}`];
  return html`<li class="bet">
    <span class="grow">
      <strong>${playerName(bet.playerId)} · ${pickLabel(bet)}</strong>
      <small class="muted">${details.filter(Boolean).join(' · ')}</small>
      ${below}
    </span>
    ${side}
  </li>`;
}

// Mid-game: how close the bet is. Overs fill toward what they need; unders
// fill toward the number that would sink them.
function progress(bet, live) {
  const label = PROP_LABELS[bet.stat];
  const text = `${fmtStat(live.value, bet.stat)} ${label} so far · ${bet.side === 'over' ? `needs ${fmtStat(live.need, bet.stat)}` : `loses at ${fmtStat(live.need + 1, bet.stat)}`}`;
  if (bet.stat === 'plusMinus') return html`<small class="muted">${text}</small>`;
  const full = bet.side === 'over' ? live.need : live.need + 1;
  const pct = Math.max(0, Math.min(100, (100 * live.value) / Math.max(1, full)));
  const tone = live.winning ? 'win' : bet.side === 'under' ? 'loss' : '';
  return html`<span class="meter ${tone}" role="img" aria-label=${text}><span style="width: ${pct}%"></span></span><small class="muted">${text}</small>`;
}

export function betResultPill(result, stake) {
  if (result === 'won') return html`<span class="pill win">+${fmtCoins(stake)}</span>`;
  if (result === 'lost') return html`<span class="pill loss">−${fmtCoins(stake)}</span>`;
  return html`<span class="pill">${result === 'push' ? 'Push' : 'Void'}</span>`;
}
