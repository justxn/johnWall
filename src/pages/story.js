// One News story, with its simulated reactions and real comments from anyone
// (joined or not).
import { html, nothing } from 'lit-html';
import { state } from '../store.js';
import { isTeam } from '../auth.js';
import { MAX_COMMENT, commentsFor } from '../news.js';
import { addComment, deleteComment } from '../actions.js';
import { avatar, backLink, icon, toast } from '../ui.js';
import { dayLabel, timeAgo } from '../util.js';
import { art, feed } from './news.js';

export const meta = { tab: 'news' };

export function view([rawId]) {
  const id = decodeURIComponent(rawId);
  const item = feed().find((i) => i.id === id);
  if (!item) {
    return html`${backLink('#/news', 'News')}
      <section class="card"><p>This story isn't in the feed anymore.</p><a class="btn secondary" href="#/news">Back to the news</a></section>`;
  }
  const real = commentsFor(state.comments, item.id);
  return html`
    ${backLink('#/news', 'News')}
    <article class="card flush story tone-${item.tone}">
      ${art(item)}
      <div class="story-text">
        <span class="kicker">${item.kicker}${item.date ? html`<span class="muted"> · ${dayLabel(item.date)}</span>` : nothing}</span>
        <h1 class="story-h1">${item.headline}</h1>
        ${item.body ? html`<p>${item.body}</p>` : nothing}
        ${item.link ? html`<a class="btn secondary sm" href=${item.link}>${item.linkLabel || 'More'}${icon('chevron')}</a>` : nothing}
      </div>
    </article>
    <section class="card">
      <div class="card-head"><h2>Comments</h2><small class="muted">${item.sim.length + real.length}</small></div>
      ${item.sim.length || real.length
        ? html`<ul class="comments">
            ${item.sim.map((c) => comment(c))}
            ${real.map((c) => comment(c, true))}
          </ul>`
        : html`<p class="muted">No comments yet. Start it off.</p>`}
      <form class="composer" @submit=${(e) => submit(e, item.id)}>
        <input name="text" maxlength=${MAX_COMMENT} placeholder="Add a comment (be nice-ish)" aria-label="Your comment" autocomplete="off" enterkeyhint="send" />
        <button class="btn sm" type="submit">Post</button>
      </form>
      ${item.sim.length ? html`<p class="hint">Comments tagged <span class="sim-tag">Sim</span> are made up by the app for fun. Everyone else is a real person.</p>` : nothing}
    </section>`;
}

// Team members can delete any real comment; anyone signed in can delete their own.
function comment(c, real = false) {
  const canDelete = real && (isTeam() || (state.uid && c.uid === state.uid));
  return html`<li class="comment">
    ${avatar(c.author, 'sm')}
    <div class="grow">
      <div class="comment-by">
        <strong class="ellipsis">${c.author}</strong>
        ${c.isPlayer ? html`<span class="pill">Player</span>` : nothing}
        ${c.sim ? html`<span class="sim-tag" title="Simulated: made up by the app">Sim</span>` : nothing}
        ${real && c.createdAt ? html`<small class="muted">${timeAgo(c.createdAt)}</small>` : nothing}
      </div>
      <p>${c.text}</p>
    </div>
    ${canDelete ? html`<button class="icon-btn" aria-label="Delete comment" @click=${() => confirm('Delete this comment?') && deleteComment(c.id)}>${icon('x')}</button>` : nothing}
  </li>`;
}

async function submit(e, itemId) {
  e.preventDefault();
  const form = e.currentTarget;
  const error = await addComment(itemId, new FormData(form).get('text'));
  if (error) toast(error, 'error');
  else form.reset();
}
