// The Book tab: your coins, the props board for upcoming games, your bets and
// the bettor leaderboard. Coins are in-app only, never real money.
import { html, nothing } from 'lit-html';
import { findGame, findPlayer, state } from '../store.js';
import { isMember, voterKey } from '../auth.js';
import { MAX_STAKE, MIN_GAMES, START_COINS, bettingOpen, coinsOf, fmtCoins, fmtNet } from '../book.js';
import { byDateAsc, statusOf } from '../stats.js';
import { count, icon, openSheet, pageHead, rerender, segmented } from '../ui.js';
import { fmtDate } from '../util.js';
import { betRow, coinBook, helpLine, propsCard } from './props.js';

export const meta = { tab: 'book' };

let tab = 'board'; // 'board', 'bets' or 'leaders'
let gameId = null; // the game the board shows, when more than one is open
let ticking = null;

// Keeps "Closes in …" current while the tab is open.
export function enter() {
  clearInterval(ticking);
  ticking = setInterval(rerender, 30_000);
}
export function leave() {
  clearInterval(ticking);
  ticking = null;
}

// "3–2", with pushes and voids as a third number when there are any.
const record = (b) => `${b.won}–${b.lost}${b.pushed ? `–${b.pushed}` : ''}`;
const nameOf = (b) => findPlayer(b.bettorId)?.name ?? b.name ?? 'Fan';
const ranked = (book) => Object.values(book).sort((a, b) => b.coins - a.coins || nameOf(a).localeCompare(nameOf(b)));

export function view() {
  const book = coinBook();
  const me = isMember() ? voterKey() : null;
  if (!me && tab === 'bets') tab = 'board';
  const mine = me ? state.bets.filter((b) => b.bettorId === me && findGame(b.gameId)) : [];
  const open = mine.filter((b) => statusOf(findGame(b.gameId)) !== 'final').length;
  const show = (next) => () => {
    tab = next;
    rerender();
  };
  return html`
    ${pageHead('Book', html`<button class="icon-btn" aria-label="House rules" @click=${openRules}>${icon('info')}</button>`)}
    ${me ? wallet(book, me) : joinCard()}
    ${segmented(
      [
        { label: 'Board', active: tab === 'board', onClick: show('board') },
        ...(me ? [{ label: html`My bets${count(open)}`, active: tab === 'bets', onClick: show('bets') }] : []),
        { label: 'Leaders', active: tab === 'leaders', onClick: show('leaders') },
      ],
      'Book',
    )}
    ${tab === 'bets' ? betsView(mine) : tab === 'leaders' ? leadersView(book, me) : boardView()}
    ${footer()}`;
}

function wallet(book, me) {
  const c = coinsOf(book, me);
  const rank = ranked(book).findIndex((b) => b.bettorId === me);
  const net = c.coins - START_COINS;
  return html`<section class="card wallet">
    <div class="between">
      <span class="wallet-balance"><small class="muted">Balance</small><b>${fmtCoins(c.available)}</b></span>
      <span class="pill ${net > 0 ? 'win' : net < 0 ? 'loss' : ''}">${fmtNet(net)} all-time</span>
    </div>
    <div class="wallet-stats">
      <span><b>${fmtCoins(c.held)}</b><small>In play</small></span>
      <span><b>${record(c)}</b><small>Record</small></span>
      <span><b>${rank >= 0 ? `#${rank + 1}` : '—'}</b><small>Rank</small></span>
    </div>
  </section>`;
}

const joinCard = () => html`<section class="card">
  <h2>Bet on the team</h2>
  <p class="muted">Over/under props on players, with in-app coins (no real money). Join with the team or fan code and get ${fmtCoins(START_COINS)} coins.</p>
  <a class="btn" href="#/join">Join</a>
</section>`;

// Props for games still open for betting, one game at a time.
function boardView() {
  const games = state.games.filter((g) => bettingOpen(g)).sort(byDateAsc);
  if (!games.length) {
    return html`<section class="card">
      <h2>Nothing on the board</h2>
      <p class="muted">Props go up for upcoming games, once players have ${MIN_GAMES} games of stats. Betting closes at tip-off.</p>
    </section>`;
  }
  const game = games.find((g) => g.id === gameId) ?? games[0];
  return html`
    ${games.length > 1
      ? html`<div class="chips" role="tablist" aria-label="Game">
          ${games.map((g) => html`<button role="tab" class="chip ${g.id === game.id ? 'on' : ''}" aria-selected=${g.id === game.id ? 'true' : 'false'}
            @click=${() => { gameId = g.id; rerender(); }}>${g.date ? fmtDate(g.date, { weekday: false }) : 'TBD'} · vs ${g.opponent || 'TBD'}</button>`)}
        </div>`
      : nothing}
    ${propsCard(game, { header: true })}`;
}

// Open bets (soonest game first), then settled ones (latest first).
function betsView(mine) {
  if (!mine.length) {
    return html`<section class="card">
      <h2>No bets yet</h2>
      <p class="muted">Pick a prop on the board: over or under, up to ${MAX_STAKE} coins a bet.</p>
      <button class="btn secondary" @click=${() => { tab = 'board'; rerender(); }}>See the board</button>
    </section>`;
  }
  const game = (b) => findGame(b.gameId);
  const latest = (a, b) => (b.placedAt ?? 0) - (a.placedAt ?? 0);
  const settled = (b) => statusOf(game(b)) === 'final';
  const open = mine.filter((b) => !settled(b)).sort((a, b) => byDateAsc(game(a), game(b)) || latest(a, b));
  const done = mine.filter(settled).sort((a, b) => byDateAsc(game(b), game(a)) || latest(a, b));
  const section = (title, list, none) => html`<h2 class="section-title">${title}</h2>
    <section class="card flush">
      ${list.length ? html`<ul class="list">${list.map((b) => betRow(b, { game: true }))}</ul>` : html`<p class="pad muted">${none}</p>`}
    </section>`;
  return html`
    ${section('Open', open, 'No open bets right now.')}
    ${section('Settled', done, 'Nothing settled yet. Bets settle when the final box score is in.')}`;
}

function leadersView(book, me) {
  const rows = ranked(book);
  return html`<section class="card flush">
    <div class="card-head"><h2>Leaderboard</h2><small class="muted">Coins after settled bets</small></div>
    ${rows.length
      ? html`<div>${rows.map((b, i) => {
          const net = b.coins - START_COINS;
          return html`<div class="lb-row ${b.bettorId === me ? 'me' : ''}">
            <span class="lb-rank">${i + 1}</span>
            <span class="lb-name">
              <strong><span class="ellipsis">${nameOf(b)}</span>${b.bettorId === me ? html`<span class="pill">You</span>` : nothing}</strong>
              <small class="muted">${record(b)}${b.open ? ` · ${b.open} open` : ''}</small>
            </span>
            <span><span class="lb-value">${fmtCoins(b.coins)}</span><span class="lb-sub ${net > 0 ? 'up' : net < 0 ? 'down' : ''}">${fmtNet(net)}</span></span>
          </div>`;
        })}</div>`
      : html`<p class="pad muted">No bets yet. Everyone starts with ${fmtCoins(START_COINS)} coins.</p>`}
  </section>`;
}

// What every sportsbook prints at the bottom of the page.
const footer = () => html`<footer class="rg">
  <p><strong>Just for fun.</strong> Book coins aren't real money. They can't be bought, sold or cashed out.</p>
  <p>If you or someone you know has a gambling problem and wants help, call <a href="tel:+18004262537">1-800-GAMBLER</a>.</p>
  <button class="link" @click=${openRules}>House rules</button>
</footer>`;

function openRules() {
  openSheet(
    () => html`<ul class="how">
        <li>Everyone starts with ${fmtCoins(START_COINS)} coins. They're in-app only, never real money.</li>
        <li>Lines come from each player's season averages. Team members can move or pull them.</li>
        <li>Every prop pays even money (bet 100, win 100), up to ${MAX_STAKE} coins a bet.</li>
        <li>Betting closes at tip-off. Bets settle from the final box score.</li>
        <li>Land right on a whole-number line and it's a push. If a player doesn't play or the stat isn't kept, the bet is void. Either way, you get your coins back.</li>
        <li>You can cancel a bet until tip-off. Players can't bet the under on themselves.</li>
      </ul>
      ${helpLine()}`,
    { title: 'House rules' },
  );
}
