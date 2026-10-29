import { html, nothing, svg } from 'lit-html';
import { dateParts, fmtDate, fmtTime, initials } from './util.js';
import { resultOf } from './stats.js';

// The whole app re-renders through lit-html, which only touches the parts of
// the page that changed. Inputs keep focus and whatever you've typed when
// someone else's update arrives.
let renderer = () => {};
let queued = false;
export const setRenderer = (fn) => {
  renderer = fn;
};
export function rerender() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    renderer();
  });
}

// --- Toasts -----------------------------------------------------------------
let toasts = [];
let toastSeq = 0;
export function toast(message, kind = 'info') {
  const id = ++toastSeq;
  toasts = [...toasts, { id, message, kind }];
  rerender();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    rerender();
  }, kind === 'error' ? 6000 : 3000);
}
export const toastLayer = () =>
  html`<div class="toasts" role="status" aria-live="polite">
    ${toasts.map((t) => html`<div class="toast ${t.kind}">${t.message}</div>`)}
  </div>`;

// --- Bottom sheet -----------------------------------------------------------
// One sheet at a time. `content` is a function so it re-renders with fresh data.
let sheet = null;
export function openSheet(content, { title = '' } = {}) {
  sheet = { content, title };
  rerender();
}
export function closeSheet() {
  sheet = null;
  rerender();
}
export const sheetOpen = () => sheet != null;
export const sheetLayer = () =>
  sheet
    ? html`<div class="sheet-backdrop" @click=${(e) => e.target === e.currentTarget && closeSheet()}>
        <div class="sheet" role="dialog" aria-modal="true" aria-label=${sheet.title || 'Dialog'}>
          <div class="sheet-head">
            <h2>${sheet.title}</h2>
            <button class="icon-btn" aria-label="Close" @click=${closeSheet}>${icon('x')}</button>
          </div>
          ${sheet.content()}
        </div>
      </div>`
    : nothing;

// --- Icons ------------------------------------------------------------------
const PATHS = {
  home: svg`<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>`,
  calendar: svg`<rect x="3" y="4.5" width="18" height="16.5" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>`,
  players: svg`<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2 .7 3.2 2.4 3.5 5.2"/>`,
  trophy: svg`<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M17 5h3v2a4 4 0 0 1-3.5 4M7 5H4v2a4 4 0 0 0 3.5 4"/>`,
  plus: svg`<path d="M12 5v14M5 12h14"/>`,
  account: svg`<circle cx="12" cy="12" r="9"/><circle cx="12" cy="10" r="3"/><path d="M6.5 18.5c1.2-2 3.1-3 5.5-3s4.3 1 5.5 3"/>`,
  chevron: svg`<path d="m9 6 6 6-6 6"/>`,
  back: svg`<path d="m15 6-6 6 6 6"/>`,
  pin: svg`<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>`,
  clock: svg`<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`,
  share: svg`<path d="M12 3v12M7.5 7.5 12 3l4.5 4.5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>`,
  undo: svg`<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>`,
  play: svg`<path d="M7 4.5v15l12-7.5-12-7.5Z" fill="currentColor"/>`,
  pause: svg`<path d="M8 5v14M16 5v14" stroke-width="3"/>`,
  medical: svg`<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/>`,
  check: svg`<path d="m5 12.5 4.5 4.5L19 7.5"/>`,
  x: svg`<path d="M6 6l12 12M18 6 6 18"/>`,
  edit: svg`<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m14 6 4 4"/>`,
  ball: svg`<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18"/><path d="M5.6 5.6c3.4 3.4 3.4 9.4 0 12.8M18.4 5.6c-3.4 3.4-3.4 9.4 0 12.8"/>`,
  live: svg`<circle cx="12" cy="12" r="3" fill="currentColor"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14"/>`,
};
export const icon = (name, cls = '') =>
  html`<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name]}</svg>`;

// --- Small components -------------------------------------------------------
export const resultPill = (game) => {
  const r = resultOf(game);
  return html`<span class="pill ${r === 'W' ? 'win' : 'loss'}">${r}</span>`;
};

export const livePill = () => html`<span class="pill live"><span class="dot"></span>LIVE</span>`;

const INJURY = {
  out: ['Out', 'loss'],
  doubtful: ['Doubtful', 'warn'],
  questionable: ['Questionable', 'gold'],
  probable: ['Probable', 'ok'],
};
export const INJURY_STATUSES = Object.keys(INJURY);
export const injuryLabel = (status) => INJURY[status]?.[0] ?? status;
export const injuryPill = (injury) =>
  injury ? html`<span class="pill ${INJURY[injury.status]?.[1] ?? 'warn'}">${injuryLabel(injury.status)}</span>` : nothing;

export const avatar = (name, cls = '') => html`<span class="avatar ${cls}" aria-hidden="true">${initials(name)}</span>`;

export const dateBlock = (iso) => {
  if (!iso) return html`<div class="dateblock"><span>TBD</span></div>`;
  const { dow, day, month } = dateParts(iso);
  return html`<div class="dateblock"><span>${dow}</span><strong>${day}</strong><span>${month}</span></div>`;
};

// "Wed, Nov 4 · 6:30 PM"
export const when = (game) => [fmtDate(game.date), fmtTime(game.time)].filter(Boolean).join(' · ');

export const gameRow = (game) => html`<li>
  <a class="row-link" href="#/games/${game.id}">
    ${resultPill(game)}
    <span class="grow">
      <span class="ellipsis">vs ${game.opponent || 'Opponent'}</span>
      <small class="muted">${fmtDate(game.date)}</small>
    </span>
    <strong class="score">${game.teamScore}–${game.opponentScore}</strong>
  </a>
</li>`;

// Tabs-style switch between a few options.
export const segmented = (items, label) => html`<div class="segmented" role="tablist" aria-label=${label}>
  ${items.map((it) =>
    it.href
      ? html`<a role="tab" href=${it.href} aria-selected=${it.active ? 'true' : 'false'} class=${it.active ? 'on' : ''}>${it.label}</a>`
      : html`<button role="tab" type="button" aria-selected=${it.active ? 'true' : 'false'} class=${it.active ? 'on' : ''} @click=${it.onClick}>${it.label}</button>`,
  )}
</div>`;

export const empty = (text, action = nothing) => html`<div class="empty"><p class="muted">${text}</p>${action}</div>`;

export const backLink = (href, label) => html`<a class="back" href=${href}>${icon('back')}<span>${label}</span></a>`;
