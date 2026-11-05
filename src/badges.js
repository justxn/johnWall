// Badges in the style of NBA 2K: each one rates a part of a player's game in
// four tiers. They're worked out from finished games every time (nothing is
// stored), so they move with the season and a cold stretch can drop a tier.
import { fmtAvg, playerLine } from './stats.js';
import { plural } from './util.js';

export const TIERS = ['Bronze', 'Silver', 'Gold', 'Hall of Fame'];
export const TIER_KEYS = ['bronze', 'silver', 'gold', 'hof'];
export const TIER_SHORT = ['Bronze', 'Silver', 'Gold', 'HOF'];

const sum = (rows, k) => rows.reduce((n, r) => n + r[k], 0);

// Each badge measures one number for a player: `measure` returns { value },
// with value null when there's nothing to go on yet, plus `need` when only a
// minimum sample is missing. Reaching a cutoff in `tiers` (Bronze, Silver,
// Gold, Hall of Fame) earns that tier. `show` formats a value, `cutoff` a tier.
const perGame = (key, unit) => ({
  measure: ({ line }) => ({ value: line.tracked[key] ? line.avg[key] : null }),
  show: (v) => `${fmtAvg(v, key)} ${unit}`,
  cutoff: String,
});

// Shooting percentages need a minimum number of attempts, so one lucky shot
// isn't Hall of Fame.
const percent = (key, min, tries) => ({
  measure: ({ line }) => {
    const { made, att } = line.shots[key];
    return att >= min ? { value: (100 * made) / att } : { value: null, need: `Needs ${min} ${tries} (${att} so far)` };
  },
  show: (v) => `${v.toFixed(1)}%`,
  cutoff: (t) => `${t}%`,
});

export const BADGES = [
  { id: 'bucket-getter', name: 'Bucket Getter', icon: '🔥', about: 'Points per game', tiers: [4, 6, 8, 11], ...perGame('points', 'PPG') },
  { id: 'automatic', name: 'Automatic', icon: '💯', about: 'FG%, from 10 shots', tiers: [40, 45, 50, 60], ...percent('fg', 10, 'shots') },
  { id: 'sharpshooter', name: 'Sharpshooter', icon: '🎯', about: '3P%, from 5 threes', tiers: [30, 35, 40, 50], ...percent('three', 5, 'threes tried') },
  {
    id: 'downtown',
    name: 'Downtown',
    icon: '🌆',
    about: 'Threes made',
    tiers: [3, 8, 15, 30],
    measure: ({ line }) => ({ value: line.shots.three.games ? line.shots.three.made : null }),
    show: (v) => plural(v, 'three'),
    cutoff: String,
  },
  { id: 'dimer', name: 'Dimer', icon: '🪙', about: 'Assists per game', tiers: [1.5, 2.5, 3.5, 5], ...perGame('assists', 'APG') },
  {
    id: 'floor-general',
    name: 'Floor General',
    icon: '🎖️',
    about: 'Assists per turnover, from 5 assists',
    tiers: [1.5, 2, 3, 4],
    // Only games where both were tracked count.
    measure: ({ rows }) => {
      const both = rows.filter((r) => r.assists != null && r.turnovers != null);
      if (!both.length) return { value: null };
      const ast = sum(both, 'assists');
      const tov = sum(both, 'turnovers');
      if (ast < 5) return { value: null, need: `Needs 5 assists (${ast} so far)` };
      return { value: tov ? ast / tov : Infinity };
    },
    show: (v) => (v === Infinity ? 'No turnovers' : `${v.toFixed(1)} AST per TO`),
    cutoff: String,
  },
  { id: 'glass-cleaner', name: 'Glass Cleaner', icon: '🧽', about: 'Rebounds per game', tiers: [3, 4.5, 6, 8], ...perGame('rebounds', 'RPG') },
  { id: 'pick-pocket', name: 'Pick Pocket', icon: '🧤', about: 'Steals per game', tiers: [0.75, 1.25, 2, 3], ...perGame('steals', 'SPG') },
  { id: 'rim-protector', name: 'Rim Protector', icon: '🛡️', about: 'Blocks per game', tiers: [0.5, 1, 1.5, 2.5], ...perGame('blocks', 'BPG') },
  {
    id: 'difference-maker',
    name: 'Difference Maker',
    icon: '📈',
    about: 'Plus-minus per game',
    tiers: [2, 4, 6, 9],
    ...perGame('plusMinus', 'per game'),
    cutoff: (t) => `+${t}`,
  },
  {
    id: 'iron-man',
    name: 'Iron Man',
    icon: '🦾',
    about: 'Games played',
    tiers: [3, 6, 10, 20],
    measure: ({ line }) => ({ value: line.gp || null }),
    show: (v) => plural(v, 'game'),
    cutoff: String,
  },
];

// "Bronze 4 · Silver 6 · Gold 8 · HOF 11"
export const cutoffs = (badge) => badge.tiers.map((t, i) => `${TIER_SHORT[i]} ${badge.cutoff(t)}`).join(' · ');

// Where a player stands on every badge (`stats` from finished games): the
// tier reached (-1 for none yet) and the next cutoff, null once at the top.
export function badgeProgress(playerId, stats) {
  const p = { line: playerLine(playerId, stats), rows: stats.filter((s) => s.playerId === playerId) };
  return BADGES.map((badge) => {
    const { value, need = null } = badge.measure(p);
    // The small allowance keeps an average that lands right on a cutoff from
    // missing it to rounding.
    const tier = value == null ? -1 : badge.tiers.findLastIndex((t) => value >= t - 1e-9);
    return { badge, value, need, tier, next: badge.tiers[tier + 1] ?? null };
  });
}

// Earned badges, best tier first (ties keep the badge order above).
export const earnedBadges = (progress) => progress.filter((b) => b.tier >= 0).sort((a, b) => b.tier - a.tier);

// Who holds each badge: [{ badge, holders: [{ player, tier, value }] }], best
// tier first, then the better number.
export function badgeHolders(players, stats) {
  const all = players.map((player) => ({ player, progress: badgeProgress(player.id, stats) }));
  return BADGES.map((badge, i) => ({
    badge,
    holders: all
      .map(({ player, progress }) => ({ player, tier: progress[i].tier, value: progress[i].value }))
      .filter((h) => h.tier >= 0)
      .sort((a, b) => b.tier - a.tier || b.value - a.value || a.player.name.localeCompare(b.player.name)),
  }));
}
