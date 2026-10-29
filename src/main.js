import './style.css';
import { configured } from './firebase.js';
import { startSync, subscribe, isReady } from './store.js';
import { hasAccess, isEditor, me, signOut } from './auth.js';
import { esc } from './util.js';
import * as gate from './pages/gate.js';
import * as dashboard from './pages/dashboard.js';
import * as games from './pages/games.js';
import * as gameForm from './pages/gameForm.js';
import * as gameDetail from './pages/gameDetail.js';
import * as players from './pages/players.js';
import * as awards from './pages/awards.js';

const app = document.getElementById('app');

const routes = [
  [/^#?\/?$/, dashboard],
  [/^#\/games$/, games],
  [/^#\/games\/new$/, gameForm],
  [/^#\/games\/([^/]+)\/edit$/, gameForm],
  [/^#\/games\/([^/]+)$/, gameDetail],
  [/^#\/players$/, players],
  [/^#\/awards$/, awards],
];

const NAV = [
  ['#/', 'Home'],
  ['#/games', 'Games'],
  ['#/players', 'Players'],
  ['#/awards', 'Awards'],
];

let current = null;
let renderedKey = '';

function shell() {
  const hash = location.hash || '#/';
  const user = me();
  app.innerHTML = `
    <header class="top">
      <a class="brand" href="#/">🏀 Intramural Hoops</a>
      <nav>${NAV.map(([h, l]) => `<a href="${h}" class="${hash === h || (h !== '#/' && hash.startsWith(h)) ? 'on' : ''}">${l}</a>`).join('')}</nav>
      <div class="who">${isEditor() ? '' : '<span class="pill gold">Viewer</span> '}${user ? `${esc(user.name)} · ` : ''}<button class="link" id="signout">Switch</button></div>
    </header>
    <main id="view"></main>`;
  app.querySelector('#signout').onclick = () => {
    signOut();
    render(true);
  };
}

// `force` re-renders even for static pages (forms), which otherwise are left
// alone when snapshots arrive so typing isn't wiped.
function render(force = false) {
  if (!configured) {
    app.innerHTML = `<main class="card"><h2>Firebase isn't set up yet</h2>
      <p>Copy <code>.env.example</code> to <code>.env</code> and fill in your Firebase project values (see README).</p></main>`;
    return;
  }
  if (!isReady()) {
    app.innerHTML = '<main class="card muted">Loading…</main>';
    return;
  }
  if (!hasAccess() || !me()) {
    current = null;
    renderedKey = '';
    gate.render(app, { onDone: () => render(true) });
    return;
  }

  const hash = location.hash || '#/';
  // Viewers can't reach the add/edit game forms.
  if (!isEditor() && (hash === '#/games/new' || /^#\/games\/[^/]+\/edit$/.test(hash))) {
    location.hash = '#/games'; // triggers hashchange -> re-render
    return;
  }
  const match = routes.map(([re, page]) => [hash.match(re), page]).find(([m]) => m);
  const [m, page] = match || [null, dashboard];
  const params = m ? m.slice(1) : [];
  const key = hash + '|' + me().id;

  if (!force && page.isForm && current === page && renderedKey === key) return;

  shell();
  current = page;
  renderedKey = key;
  page.render(app.querySelector('#view'), params);
}

subscribe(() => render());
window.addEventListener('hashchange', () => render(true));
if (configured) startSync();
render();
