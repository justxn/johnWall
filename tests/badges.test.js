import { describe, expect, it } from 'vitest';
import { BADGES, badgeHolders, badgeProgress, cutoffs, earnedBadges } from '../src/badges.js';

const line = (gameId, playerId, stats) => ({ gameId, playerId, ...stats });
const of = (progress, id) => progress.find((b) => b.badge.id === id);

describe('badge tiers', () => {
  it('earns the highest cutoff reached and points at the next one', () => {
    const stats = [line('g1', 'p1', { points: 6 }), line('g2', 'p1', { points: 7 })];
    const bucket = of(badgeProgress('p1', stats), 'bucket-getter');
    expect(bucket).toMatchObject({ value: 6.5, tier: 1, next: 8 }); // Silver, Gold at 8
    expect(bucket.badge.show(bucket.value)).toBe('6.5 PPG');
  });

  it('counts landing exactly on a cutoff', () => {
    const stats = [line('g1', 'p1', { rebounds: 4 }), line('g2', 'p1', { rebounds: 5 })];
    expect(of(badgeProgress('p1', stats), 'glass-cleaner').tier).toBe(1); // 4.5 RPG is Silver
  });

  it('tops out at Hall of Fame', () => {
    const hof = of(badgeProgress('p1', [line('g1', 'p1', { points: 12 })]), 'bucket-getter');
    expect(hof).toMatchObject({ tier: 3, next: null });
  });

  it('has nothing for stats that were never tracked or are below Bronze', () => {
    const progress = badgeProgress('p1', [line('g1', 'p1', { points: 3, rebounds: null })]);
    expect(of(progress, 'bucket-getter')).toMatchObject({ tier: -1, next: 4 });
    expect(of(progress, 'glass-cleaner')).toMatchObject({ value: null, tier: -1 });
  });
});

describe('shooting badges', () => {
  it('waits for enough attempts', () => {
    const sharp = of(badgeProgress('p1', [line('g1', 'p1', { fg3m: 2, fg3a: 3 })]), 'sharpshooter');
    expect(sharp).toMatchObject({ value: null, tier: -1, need: 'Needs 5 threes tried (3 so far)' });
  });

  it('works out percentages exactly, so 7 of 20 is 35%', () => {
    const stats = [line('g1', 'p1', { fg3m: 3, fg3a: 10 }), line('g2', 'p1', { fg3m: 4, fg3a: 10 })];
    const sharp = of(badgeProgress('p1', stats), 'sharpshooter');
    expect(sharp.value).toBe(35);
    expect(sharp.tier).toBe(1); // Silver starts at 35%
    expect(sharp.badge.show(sharp.value)).toBe('35.0%');
  });

  it('counts threes made for Downtown', () => {
    const stats = [line('g1', 'p1', { fg3m: 5, fg3a: 9 }), line('g2', 'p1', { fg3m: 4, fg3a: 8 })];
    expect(of(badgeProgress('p1', stats), 'downtown')).toMatchObject({ value: 9, tier: 1 });
  });
});

describe('other badges', () => {
  it('rates assists per turnover once there are 5 assists', () => {
    expect(of(badgeProgress('p1', [line('g1', 'p1', { assists: 3, turnovers: 0 })]), 'floor-general').need).toBe('Needs 5 assists (3 so far)');
    const clean = of(badgeProgress('p1', [line('g1', 'p1', { assists: 6, turnovers: 0 })]), 'floor-general');
    expect(clean).toMatchObject({ value: Infinity, tier: 3 });
    expect(clean.badge.show(clean.value)).toBe('No turnovers');
    // A game without turnovers tracked doesn't count toward it.
    const mixed = [line('g1', 'p1', { assists: 6, turnovers: 3 }), line('g2', 'p1', { assists: 9, turnovers: null })];
    expect(of(badgeProgress('p1', mixed), 'floor-general')).toMatchObject({ value: 2, tier: 1 });
  });

  it('needs a positive plus-minus for Difference Maker', () => {
    expect(of(badgeProgress('p1', [line('g1', 'p1', { plusMinus: -4 })]), 'difference-maker').tier).toBe(-1);
    const plus = of(badgeProgress('p1', [line('g1', 'p1', { plusMinus: 5 })]), 'difference-maker');
    expect(plus.tier).toBe(1);
    expect(plus.badge.show(plus.value)).toBe('+5.0 per game');
  });

  it('counts games for Iron Man', () => {
    const stats = ['g1', 'g2', 'g3'].map((g) => line(g, 'p1', { points: 2 }));
    expect(of(badgeProgress('p1', stats), 'iron-man')).toMatchObject({ value: 3, tier: 0 });
  });
});

describe('lists', () => {
  it('lists earned badges best tier first', () => {
    const stats = [line('g1', 'p1', { points: 12, rebounds: 3, steals: 1 })];
    expect(earnedBadges(badgeProgress('p1', stats)).map((b) => [b.badge.id, b.tier])).toEqual([
      ['bucket-getter', 3],
      ['glass-cleaner', 0],
      ['pick-pocket', 0],
    ]);
  });

  it('ranks badge holders by tier, then by the number', () => {
    const players = [{ id: 'p1', name: 'Marcus' }, { id: 'p2', name: 'Devon' }, { id: 'p3', name: 'Tyler' }];
    const stats = [line('g1', 'p1', { points: 7 }), line('g1', 'p2', { points: 9 }), line('g1', 'p3', { points: 6 })];
    const bucket = badgeHolders(players, stats).find((b) => b.badge.id === 'bucket-getter');
    expect(bucket.holders.map((h) => [h.player.name, h.tier])).toEqual([['Devon', 2], ['Marcus', 1], ['Tyler', 1]]);
  });

  it('describes every badge with four rising cutoffs', () => {
    for (const badge of BADGES) {
      expect(badge.tiers).toHaveLength(4);
      expect([...badge.tiers].sort((a, b) => a - b)).toEqual(badge.tiers);
    }
    expect(cutoffs(BADGES[0])).toBe('Bronze 4 · Silver 6 · Gold 8 · HOF 11');
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(BADGES.length);
  });
});
