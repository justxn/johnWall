import { state } from '../store.js';
import { playerLine, fmtAvg } from '../stats.js';
import { awardWins } from '../awards.js';
import { esc } from '../util.js';

export function render(root) {
  const wins = awardWins(state.games, state.categories, state.votes);
  const total = (pid) => Object.values(wins).reduce((n, byPlayer) => n + (byPlayer[pid] || 0), 0);

  const rows = state.players
    .map((p) => ({ p, line: playerLine(p.id, state.stats), awards: total(p.id) }))
    .sort((a, b) => (b.line.avg.points ?? -1) - (a.line.avg.points ?? -1));

  // Show "(n)" when a stat was only tracked in some of the games played.
  const cell = (line, k) => {
    const note = line.tracked[k] < line.gp ? ` <small class="muted">(${line.tracked[k]}/${line.gp})</small>` : '';
    return `${fmtAvg(line.avg[k])}${line.gp ? note : ''}`;
  };

  root.innerHTML = `<section class="card">
    <h2>Player stats</h2>
    ${rows.length ? `<div class="scroll"><table class="box">
      <thead><tr><th>Player</th><th>GP</th><th>PPG</th><th>RPG</th><th>APG</th><th>🏆</th></tr></thead>
      <tbody>${rows.map(({ p, line, awards }) => `<tr>
        <td>${esc(p.name)}</td><td>${line.gp}</td>
        <td>${cell(line, 'points')}</td><td>${cell(line, 'rebounds')}</td><td>${cell(line, 'assists')}</td>
        <td>${awards}</td></tr>`).join('')}</tbody>
    </table></div>
    <p class="muted">Averages only count games where the stat was tracked. (n/gp) shows how many games that is. 🏆 = awards won.</p>` : '<p class="muted">No players yet.</p>'}
  </section>`;
}
