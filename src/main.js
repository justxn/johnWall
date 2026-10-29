import './style.css';
import { html, nothing, render } from 'lit-html';
import { configured } from './firebase.js';
import { findPlayer, isReady, startSync, state, subscribe, teamName } from './store.js';
import { isMember, isTeam, myName, myPlayerId, role } from './auth.js';
import { avatar, closeSheet, icon, openSheet, rerender, setRenderer, sheetLayer, sheetOpen, toastLayer } from './ui.js';
import { initTheme } from './theme.js';
import { seedOnce } from './seed.js';
import * as home from './pages/home.js';
import * as games from './pages/games.js';
import * as gameDetail from './pages/gameDetail.js';
import * as gameForm from './pages/gameForm.js';
import * as scorer from './pages/scorer.js';
import * as players from './pages/players.js';
import * as player from './pages/player.js';
import * as injuries from './pages/injuries.js';
import * as awards from './pages/awards.js';
import * as settings from './pages/settings.js';
import * as join from './pages/join.js';

// [pattern, page, options passed to the page]. Order matters: fixed paths
// before /games/:id.
const routes = [
  [/^#?\/?$/, home],
  [/^#\/games$/, games],
  [/^#\/games\/new$/, gameForm, { mode: 'result' }],
  [/^#\/games\/schedule$/, gameForm, { mode: 'schedule' }],
  [/^#\/games\/live\/new$/, scorer],
  [/^#\/games\/([^/]+)\/edit$/, gameForm, { mode: 'edit' }],
  [/^#\/games\/([^/]+)\/result$/, gameForm, { mode: 'result' }],
  [/^#\/games\/([^/]+)\/live$/, scorer],
  [/^#\/games\/([^/]+)$/, gameDetail],
  [/^#\/players$/, players],
  [/^#\/players\/([^/]+)$/, player],
  [/^#\/injuries$/, injuries],
  [/^#\/awards$/, awards],
  [/^#\/settings$/, settings],
  [/^#\/join$/, join],
];

const TABS = [
  { id: 'home', href: '#/', label: 'Home', icon: 'home' },
  { id: 'games', href: '#/games', label: 'Games', icon: 'calendar' },
  { id: 'players', href: '#/players', label: 'Players', icon: 'players' },
  { id: 'awards', href: '#/awards', label: 'Awards', icon: 'trophy' },
];

let current = null;

function route() {
  const hash = location.hash || '#/';
  for (const [re, page, opts = {}] of routes) {
    const m = hash.match(re);
    if (m) return { hash, page, params: m.slice(1), opts };
  }
  return { hash, page: home, params: [], opts: {} };
}

function navigate() {
  const next = route();
  const changed = next.hash !== current?.hash;
  const prev = current;
  current = next;
  if (changed) {
    prev?.page.leave?.();
    closeSheet();
    current.page.enter?.(current.params, current.opts);
    scrollTo(0, 0);
  }
  rerender();
}

const displayName = () => findPlayer(myPlayerId())?.name || myName() || (isTeam() ? 'Team' : 'Fan');

function addGameSheet() {
  const item = (href, ico, title, sub) => html`<a href=${href} @click=${closeSheet}>
    ${icon(ico)}<span><strong>${title}</strong><small class="muted">${sub}</small></span>
  </a>`;
  openSheet(
    () => html`<nav class="action-list">
      ${item('#/games/live/new', 'live', 'Start a live game', 'Keep score courtside, tap by tap')}
      ${item('#/games/new', 'check', 'Add a final score', 'Enter the result and box score after the game')}
      ${item('#/games/schedule', 'calendar', 'Schedule a game', 'So people can say whether they\'re in')}
    </nav>`,
    { title: 'Add a game' },
  );
}

const topBar = (meta) => html`<header class="topbar">
  <a class="brand" href="#/">${icon('ball')}<span class="ellipsis">${teamName()}</span></a>
  <nav class="topnav" aria-label="Main">
    ${TABS.map((t) => html`<a href=${t.href} class=${meta.tab === t.id ? 'on' : ''}>${t.label}</a>`)}
  </nav>
  <div class="topbar-actions">
    ${isMember()
      ? html`<a class="me" href="#/settings" aria-label="Settings">
          ${role() === 'fan' ? html`<span class="pill gold">Fan</span>` : nothing}${avatar(displayName())}
        </a>`
      : html`<a class="btn sm" href="#/join">Join</a>
          <a class="icon-btn" href="#/settings" aria-label="Settings">${icon('account')}</a>`}
  </div>
</header>`;

const tabBar = (meta) => html`<nav class="tabbar" aria-label="Main">
  ${TABS.map(
    (t) => html`<a href=${t.href} class=${meta.tab === t.id ? 'on' : ''} aria-current=${meta.tab === t.id ? 'page' : 'false'}>
      ${icon(t.icon)}<span>${t.label}</span>
    </a>`,
  )}
</nav>`;

const banners = () => html`
  ${state.online ? nothing : html`<div class="banner">You're offline. Showing what's saved on this phone; changes sync when you reconnect.</div>`}
  ${state.error
    ? html`<div class="banner error">
        Couldn't load everything (${state.error.code || state.error.message}).
        ${state.error.code === 'permission-denied' ? 'If the app was just updated, publish the new firestore.rules (see README).' : ''}
      </div>`
    : nothing}`;

function view() {
  if (!configured) {
    return html`<main><section class="card">
      <h2>Firebase isn't set up yet</h2>
      <p>Copy <code>.env.example</code> to <code>.env</code> and fill in your Firebase project values (see README).</p>
    </section></main>`;
  }
  if (!isReady()) {
    return html`${banners()}<main class="loading"><div class="spinner" role="progressbar" aria-label="Loading"></div></main>`;
  }
  const { page, params, opts } = current;
  const meta = page.meta || {};
  const blocked = meta.teamOnly && !isTeam();
  return html`
    ${meta.bare ? nothing : topBar(meta)}
    ${banners()}
    <main id="view" class=${meta.bare ? 'bare' : ''}>
      ${blocked
        ? html`<section class="card">
            <h2>Team members only</h2>
            <p class="muted">Enter your team code to add games and keep score.</p>
            <a class="btn" href="#/join">Join the team</a>
          </section>`
        : page.view(params, opts)}
    </main>
    ${meta.bare ? nothing : tabBar(meta)}
    ${meta.fab && isTeam() ? html`<button class="fab" aria-label="Add a game" @click=${addGameSheet}>${icon('plus')}</button>` : nothing}
    ${sheetLayer()}
    ${toastLayer()}`;
}

initTheme();
const root = document.getElementById('app');
setRenderer(() => render(view(), root));
addEventListener('hashchange', navigate);
addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && sheetOpen()) closeSheet();
});
navigate();

if (configured) {
  subscribe(() => {
    if (isReady()) seedOnce(state, isTeam());
    rerender();
  });
  startSync();
  // Keep running game clocks ticking on screen.
  setInterval(() => {
    if (!document.hidden && state.games.some((g) => g.status === 'live' && g.live?.clockStartedAt)) rerender();
  }, 1000);
}

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Service worker not registered', err));
  });
}
