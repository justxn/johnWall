import { html, nothing } from 'lit-html';
import { findPlayer, gameStats, state, teamName } from './store.js';
import { tally, winners } from './awards.js';
import { STAT_LABELS, resultOf } from './stats.js';
import { closeSheet, icon, openSheet, toast } from './ui.js';
import { fmtDate, fmtTime, normName } from './util.js';

const W = 1080;
const H = 1350;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

// Shrinks the font until the text fits the width.
function fit(ctx, text, maxWidth, size, weight) {
  let s = size;
  do {
    ctx.font = `${weight} ${s}px ${FONT}`;
    s -= 4;
  } while (ctx.measureText(text).width > maxWidth && s > 20);
}

function ball(ctx, x, y, r, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = '#f26b21';
  ctx.lineWidth = r * 0.06;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.moveTo(x - r, y);
  ctx.lineTo(x + r, y);
  ctx.moveTo(x, y - r);
  ctx.lineTo(x, y + r);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x - r * 1.35, y, r, -0.75, 0.75);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + r * 1.35, y, r, Math.PI - 0.75, Math.PI + 0.75);
  ctx.stroke();
  ctx.restore();
}

function topLines(game) {
  return gameStats(game.id)
    .filter((s) => s.points != null)
    .sort((a, b) => b.points - a.points)
    .slice(0, 3)
    .map((s) => {
      const extras = ['rebounds', 'assists', 'steals', 'blocks'].filter((k) => s[k]).map((k) => `${s[k]} ${STAT_LABELS[k]}`);
      return { name: findPlayer(s.playerId)?.name ?? 'Unknown', text: [`${s.points} PTS`, ...extras.slice(0, 2)].join(' · ') };
    });
}

export function drawRecap(game) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const won = resultOf(game) === 'W';

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#1e2128');
  bg.addColorStop(1, '#0e1013');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ball(ctx, W - 90, 150, 300, 0.12);
  ctx.fillStyle = '#f26b21';
  ctx.fillRect(0, 0, W, 14);

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  const x = 80;
  ctx.fillStyle = '#f26b21';
  fit(ctx, teamName().toUpperCase(), W - 160, 46, 800);
  ctx.fillText(teamName().toUpperCase(), x, 140);

  ctx.fillStyle = won ? '#2fb36b' : '#e5484d';
  ctx.font = `900 170px ${FONT}`;
  ctx.fillText(won ? 'WIN' : 'LOSS', x - 6, 320);

  ctx.fillStyle = '#ffffff';
  const score = `${game.teamScore}–${game.opponentScore}`;
  fit(ctx, score, W - 160, 230, 900);
  ctx.fillText(score, x - 8, 540);

  const vs = `vs ${game.opponent}`;
  fit(ctx, vs, W - 160, 60, 700);
  ctx.fillText(vs, x, 630);

  ctx.fillStyle = '#9aa1ae';
  ctx.font = `500 36px ${FONT}`;
  ctx.fillText([fmtDate(game.date), fmtTime(game.time), game.location].filter(Boolean).join('  ·  '), x, 690);

  ctx.fillStyle = '#2f343e';
  ctx.fillRect(x, 750, W - 160, 3);

  let y = 840;
  const mvp = winners(tally(state.votes, game.id, 'mvp'));
  if (mvp.length) {
    ctx.fillStyle = '#e9b52e';
    ctx.font = `800 34px ${FONT}`;
    ctx.fillText('MVP', x, y);
    ctx.fillStyle = '#ffffff';
    const names = mvp.map((id) => findPlayer(id)?.name ?? 'Unknown').join(' & ');
    fit(ctx, names, W - 160, 72, 850);
    ctx.fillText(names, x, y + 78);
    y += 170;
  }

  const lines = topLines(game);
  if (lines.length) {
    ctx.fillStyle = '#9aa1ae';
    ctx.font = `800 30px ${FONT}`;
    ctx.fillText('TOP PERFORMERS', x, y);
    y += 62;
    for (const l of lines) {
      ctx.fillStyle = '#ffffff';
      ctx.font = `750 44px ${FONT}`;
      const nameWidth = Math.min(ctx.measureText(l.name).width, 460);
      fit(ctx, l.name, 460, 44, 750);
      ctx.fillText(l.name, x, y);
      ctx.fillStyle = '#c9ced8';
      fit(ctx, l.text, W - 160 - nameWidth - 30, 40, 500);
      ctx.fillText(l.text, x + nameWidth + 30, y);
      y += 64;
    }
  }

  ctx.fillStyle = '#5b6270';
  ctx.font = `600 28px ${FONT}`;
  ctx.fillText('Intramural Hoops', x, H - 70);
  return canvas;
}

let current = null; // { url, file }

const slug = (s) => normName(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'game';

export async function openRecap(game) {
  const blob = await new Promise((resolve) => drawRecap(game).toBlob(resolve, 'image/png'));
  if (!blob) return toast('Couldn\'t make the image on this device.', 'error');
  if (current) URL.revokeObjectURL(current.url);
  const file = new File([blob], `${slug(teamName())}-vs-${slug(game.opponent)}.png`, { type: 'image/png' });
  current = { url: URL.createObjectURL(blob), file };
  // Sharing has to start from a tap, so the image is ready before the Share button is.
  const canShare = navigator.canShare?.({ files: [file] }) ?? false;
  openSheet(
    () => html`<img class="recap-preview" src=${current.url} alt="Recap image for the game" />
      <div class="form-actions">
        ${canShare ? html`<button class="btn" @click=${share}>${icon('share')}Share</button>` : nothing}
        <a class="btn ${canShare ? 'secondary' : ''}" href=${current.url} download=${current.file.name} @click=${() => setTimeout(closeSheet, 300)}>Save image</a>
      </div>`,
    { title: 'Share recap' },
  );
}

async function share() {
  try {
    await navigator.share({ files: [current.file], title: 'Game recap' });
    closeSheet();
  } catch (err) {
    if (err.name !== 'AbortError') toast('Couldn\'t share. Try Save image instead.', 'error');
  }
}
