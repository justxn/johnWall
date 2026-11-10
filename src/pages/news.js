// The News tab: stories made up from the games (see src/news.js), newest
// first. The top one gets the big card; tap any story for its comments
// (pages/story.js).
import { html, nothing } from 'lit-html';
import { findPlayer, state, teamName } from '../store.js';
import { SECTIONS, buildFeed, commentCount, commentsFor, sectionOf, tickerItems } from '../news.js';
import { TIERS, TIER_KEYS } from '../badges.js';
import { avatar, icon, pageHead, rerender } from '../ui.js';
import { dayLabel, plural } from '../util.js';

export const meta = { tab: 'news' };

let section = 'all'; // the chosen filter chip

const input = () => ({ ...state, teamName: teamName() });
export const feed = () => buildFeed(input());
export const storyHref = (item) => `#/news/${encodeURIComponent(item.id)}`;

export function view() {
  const items = feed();
  const available = SECTIONS.filter((s) => s.id === 'all' || items.some((i) => sectionOf(i) === s.id));
  if (!available.some((s) => s.id === section)) section = 'all';
  const shown = section === 'all' ? items : items.filter((i) => sectionOf(i) === section);
  const [lead, ...rest] = shown;
  return html`
    ${pageHead('News')}
    ${ticker(tickerItems(input()))}
    ${available.length > 2 ? filters(available) : nothing}
    ${lead ? leadStory(lead) : nothing}
    ${byDay(rest).map(([day, list]) => html`
      <h2 class="section-title">${day ? dayLabel(day) : 'Earlier'}</h2>
      <section class="card flush"><ul class="list">${list.map(storyRow)}</ul></section>`)}`;
}

// Consecutive stories from the same day, together: [[date, [story]]].
function byDay(items) {
  const groups = [];
  for (const item of items) {
    const last = groups.at(-1);
    if (last && last[0] === item.date) last[1].push(item);
    else groups.push([item.date, [item]]);
  }
  return groups;
}

// Scores, the next game, leaders and injuries, scrolling past like a TV
// ticker. The second copy makes the loop seamless and is hidden from screen
// readers; with reduced motion it's a row you can swipe instead.
function ticker(items) {
  if (!items.length) return nothing;
  const run = (copy) => html`<div class="ticker-run" aria-hidden=${copy ? 'true' : nothing}>
    ${items.map((t) => html`<span class="tick"><b>${t.label}</b>${t.text}</span>`)}
  </div>`;
  return html`<div class="ticker" role="marquee" aria-label="Quick hits">
    <div class="ticker-track" style="--dur: ${Math.max(24, items.length * 6)}s">${run(false)}${run(true)}</div>
  </div>`;
}

const filters = (list) => html`<div class="chips" role="tablist" aria-label="Show">
  ${list.map((s) => html`<button role="tab" class="chip ${section === s.id ? 'on' : ''}" aria-selected=${section === s.id ? 'true' : 'false'}
    @click=${() => { section = s.id; rerender(); }}>${s.label}</button>`)}
</div>`;

const comments = (item) => {
  const n = commentCount(item, state.comments);
  return html`<small class="story-meta">${icon('chat')}${n ? plural(n, 'comment') : 'Comment'}</small>`;
};

function leadStory(item) {
  const latest = commentsFor(state.comments, item.id).at(-1) ?? item.sim[0];
  return html`<a class="card flush story-lead tone-${item.tone}" href=${storyHref(item)}>
    ${art(item)}
    <div class="story-text">
      <span class="kicker">${item.kicker}${item.date ? html`<span class="muted"> · ${dayLabel(item.date)}</span>` : nothing}</span>
      <h2 class="story-headline">${item.headline}</h2>
      ${item.body ? html`<p class="muted">${item.body}</p>` : nothing}
      ${latest
        ? html`<p class="story-quote">“${latest.text}” <small class="muted">${latest.author}</small>${latest.sim ? html` <span class="sim-tag">Sim</span>` : nothing}</p>`
        : nothing}
      ${comments(item)}
    </div>
  </a>`;
}

const storyRow = (item) => html`<li><a class="story-row tone-${item.tone}" href=${storyHref(item)}>
  <span class="grow">
    <span class="kicker">${item.kicker}</span>
    <strong class="story-title">${item.headline}</strong>
    ${comments(item)}
  </span>
  <span class="thumb" aria-hidden="true">${item.icon}</span>
</a></li>`;

// The picture at the top of a big story: the final score, the number that
// made the news, or the story's emoji.
export function art(item) {
  const a = item.art;
  if (a?.type === 'score') {
    return html`<div class="art art-score tone-${item.tone}" aria-hidden="true">
      <span class="art-tag">Final</span>
      <span class="art-side ${a.won ? 'won' : ''}"><small>${teamName()}</small><b>${a.us}</b></span>
      <span class="art-side ${a.won ? '' : 'won'}"><small>${a.opp}</small><b>${a.them}</b></span>
    </div>`;
  }
  if (a?.type === 'matchup') {
    return html`<div class="art art-score art-vs tone-${item.tone}" aria-hidden="true">
      <span class="art-tag">${a.when || 'Next game'}</span>
      <span class="art-team">${teamName()}</span>
      <span class="vs-badge">VS</span>
      <span class="art-team">${a.opp}</span>
    </div>`;
  }
  const who = item.playerId ? findPlayer(item.playerId)?.name : null;
  if (a?.type === 'badge') {
    return html`<div class="art tone-gold" aria-hidden="true">
      <span class="medal big tier-${TIER_KEYS[a.tier]}">${a.icon}</span>
      <span class="art-num"><b>${TIERS[a.tier]}</b><small>${who ?? 'Badge'}</small></span>
    </div>`;
  }
  if (a?.type === 'stat') {
    return html`<div class="art tone-${item.tone}" aria-hidden="true">
      ${who ? avatar(who, 'lg') : html`<span class="art-emoji">${item.icon}</span>`}
      <span class="art-num"><b>${a.value}</b><small>${a.label}</small></span>
    </div>`;
  }
  return html`<div class="art tone-${item.tone}" aria-hidden="true">
    <span class="art-emoji">${item.icon}</span>
    ${who ? html`<span class="art-num"><b class="art-name">${who}</b></span>` : nothing}
  </div>`;
}
