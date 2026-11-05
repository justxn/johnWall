// The Book tab: your coins and bets, games open for betting, and the bettor
// leaderboard. Coins are in-app only.
import { html, nothing } from 'lit-html';
import { findGame, findPlayer, gameLines, state } from '../store.js';
import { isMember, voterKey } from '../auth.js';
import { MAX_STAKE, MIN_GAMES, START_COINS, bettingOpen, coinsOf, grade, pickLabel } from '../book.js';
import { byDateAsc, statusOf } from '../stats.js';
import { icon } from '../ui.js';
import { fmtDate, plural } from '../util.js';
import { coinBook, resultPill } from './props.js';

export const meta = { tab: 'book' };

const coins = (n) => n.toLocaleString();
// "3–2", with pushes and voids as a third number when there are any.
const record = (b) => `${b.won}–${b.lost}${b.pushed ? `–${b.pushed}` : ''}`;

export function view() {
  const book = coinBook();
  return html`
    <h1>Book</h1>
    ${isMember() ? myCard(coinsOf(book, voterKey())) : joinCard()}
    ${openGames()}
    ${isMember() ? myBets(voterKey()) : nothing}
    ${leaderboard(book)}
    ${howItWorks()}`;
}

const myCard = (c) => html`<section class="card">
  <small class="muted">Your coins</small>
  <div class="coins-big">${coins(c.coins)}</div>
  <small class="muted">${c.held ? `${coins(c.held)} riding on open bets · ` : ''}Record ${record(c)}</small>
</section>`;

const joinCard = () => html`<section class="card">
  <h2>Bet on the team</h2>
  <p class="muted">Over/under props on players, with in-app coins (no real money). Join with the team or fan code to get ${coins(START_COINS)} coins.</p>
  <a class="btn" href="#/join">Join</a>
</section>`;

function openGames() {
  const games = state.games
    .filter((g) => bettingOpen(g))
    .sort(byDateAsc)
    .map((game) => ({ game, props: gameLines(game.id).filter((l) => !l.pulled).length }))
    .filter((x) => x.props);
  if (!games.length) {
    return html`<section class="card"><h2>Open for betting</h2>
      <p class="muted">No props up right now. Upcoming games get lines once players have ${MIN_GAMES} games of stats.</p></section>`;
  }
  return html`<section class="card flush">
    <div class="card-head"><h2>Open for betting</h2></div>
    <ul class="list">${games.map(({ game, props }) => html`<li><a class="row-link" href="#/games/${game.id}">
      <span class="grow"><strong class="ellipsis">vs ${game.opponent || 'TBD'}</strong><small class="muted">${fmtDate(game.date)} · ${plural(props, 'prop')}</small></span>
      ${icon('chevron', 'chev')}
    </a></li>`)}</ul>
  </section>`;
}

function myBets(bettorId) {
  const bets = state.bets.filter((b) => b.bettorId === bettorId && findGame(b.gameId)).sort((a, b) => (b.placedAt ?? 0) - (a.placedAt ?? 0));
  if (!bets.length) return nothing;
  const lines = new Map(state.stats.map((s) => [`${s.gameId}_${s.playerId}`, s]));
  return html`<section class="card flush">
    <div class="card-head"><h2>Your bets</h2></div>
    <ul class="list">${bets.map((bet) => {
      const game = findGame(bet.gameId);
      const status = statusOf(game);
      return html`<li><a class="row-link" href="#/games/${game.id}">
        <span class="grow">
          <strong class="ellipsis">${findPlayer(bet.playerId)?.name ?? 'Unknown'} · ${pickLabel(bet)}</strong>
          <small class="muted">vs ${game.opponent} · ${coins(bet.stake)} coins</small>
        </span>
        ${status === 'final'
          ? resultPill(grade(bet, lines.get(`${bet.gameId}_${bet.playerId}`)), bet.stake)
          : html`<span class="pill">${status === 'live' ? 'Live' : 'Open'}</span>`}
      </a></li>`;
    })}</ul>
  </section>`;
}

function leaderboard(book) {
  const name = (b) => findPlayer(b.bettorId)?.name ?? b.name ?? 'Fan';
  const rows = Object.values(book).sort((a, b) => b.coins - a.coins || name(a).localeCompare(name(b)));
  return html`<section class="card flush">
    <div class="card-head"><h2>Leaderboard</h2></div>
    ${rows.length
      ? html`<div>${rows.map((b, i) => html`<div class="lb-row">
          <span class="lb-rank">${i + 1}</span>
          <span class="lb-name"><strong><span class="ellipsis">${name(b)}</span></strong></span>
          <span><span class="lb-value">${coins(b.coins)}</span><span class="lb-sub">${record(b)}</span></span>
        </div>`)}</div>`
      : html`<p class="pad muted">No bets yet.</p>`}
  </section>`;
}

const howItWorks = () => html`<section class="card">
  <h2>How it works</h2>
  <ul class="how">
    <li>Everyone starts with ${coins(START_COINS)} coins. They're in-app only, never real money.</li>
    <li>Lines come from each player's averages, and team members can move them.</li>
    <li>Bets pay even money (bet 100, win 100), up to ${MAX_STAKE} a bet.</li>
    <li>Betting closes at tip-off. Bets settle when the final box score is in.</li>
    <li>If a player doesn't play or the stat isn't tracked, the bet is void and you get your coins back.</li>
    <li>Players can't bet the under on themselves.</li>
  </ul>
</section>`;
