// The News tab: headlines made up from the games, with simulated reactions
// and real comments from anyone (joined or not).
import { html, nothing } from 'lit-html';
import { state, teamName } from '../store.js';
import { isTeam } from '../auth.js';
import { MAX_COMMENT, buildFeed, commentsFor } from '../news.js';
import { addComment, deleteComment } from '../actions.js';
import { avatar, rerender, toast } from '../ui.js';
import { fmtDate } from '../util.js';

export const meta = { tab: 'news' };

const open = new Set(); // stories whose comments are expanded

export function view() {
  const feed = buildFeed({ ...state, teamName: teamName() });
  return html`
    <h1>News</h1>
    <p class="muted news-sub">Totally real reporting. Reactions tagged <span class="sim-tag">sim</span> are simulated; everyone else is a real person.</p>
    ${feed.map(story)}`;
}

function story(item) {
  const real = commentsFor(state.comments, item.id);
  const shown = open.has(item.id);
  const total = item.sim.length + real.length;
  const day = item.ts ? new Date(item.ts).toISOString().slice(0, 10) : '';
  return html`<article class="card news-item">
    <div class="news-head">
      <span class="news-icon" aria-hidden="true">${item.icon}</span>
      <div class="grow">
        <h2>${item.link ? html`<a class="plain" href=${item.link}>${item.headline}</a>` : item.headline}</h2>
        ${item.body ? html`<p class="muted">${item.body}</p>` : nothing}
        ${day && item.kind !== 'welcome' ? html`<small class="muted">${fmtDate(day)}</small>` : nothing}
      </div>
    </div>
    ${shown
      ? html`<div class="news-comments">
          ${item.sim.map((c) => comment(c, null))}
          ${real.map((c) => comment({ ...c, sim: false }, c))}
          ${commentBox(item.id)}
        </div>`
      : nothing}
    <button class="btn ghost sm" @click=${() => toggle(item.id)}>
      ${shown ? 'Hide comments' : total ? `${total} comment${total === 1 ? '' : 's'}` : 'Be the first to comment'}
    </button>
  </article>`;
}

function comment(c, real) {
  return html`<div class="news-comment ${c.sim ? 'sim' : ''}">
    ${avatar(c.author)}
    <div class="grow">
      <strong>${c.author}</strong>${c.isPlayer ? html` <span class="pill">Player</span>` : nothing}${c.sim ? html` <span class="sim-tag">sim</span>` : nothing}
      <p>${c.text}</p>
    </div>
    ${real && isTeam() ? html`<button class="icon-btn" aria-label="Delete comment" @click=${() => deleteComment(real.id)}>✕</button>` : nothing}
  </div>`;
}

const commentBox = (itemId) => html`<form class="comment-box" @submit=${(e) => submit(e, itemId)}>
  <input name="text" maxlength=${MAX_COMMENT} placeholder="Say something (be nice-ish)" autocomplete="off" />
  <button class="btn sm" type="submit">Post</button>
</form>`;

function toggle(id) {
  if (open.has(id)) open.delete(id);
  else open.add(id);
  rerender();
}

async function submit(e, itemId) {
  e.preventDefault();
  const form = e.currentTarget;
  const error = await addComment(itemId, new FormData(form).get('text'));
  if (error) toast(error, 'error');
  else form.reset();
}
