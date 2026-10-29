// Live game clock and minutes, kept on the game doc while it's being scored:
//   live = { clockBase, clockStartedAt, onCourt: { [playerId]: enteredAtMs },
//            played: { [playerId]: ms } }
// All times are game-clock milliseconds, so pausing the clock pauses everyone's
// minutes too. Updates come back as { set, remove } so this stays Firestore-free.

export function clockMs(live, now = Date.now()) {
  if (!live) return 0;
  return (live.clockBase || 0) + (live.clockStartedAt ? Math.max(0, now - live.clockStartedAt) : 0);
}

export const clockRunning = (live) => Boolean(live?.clockStartedAt);
export const isOnCourt = (live, playerId) => live?.onCourt?.[playerId] != null;

export function playedMs(live, playerId, now = Date.now()) {
  const base = live?.played?.[playerId] || 0;
  if (!isOnCourt(live, playerId)) return base;
  return base + Math.max(0, clockMs(live, now) - live.onCourt[playerId]);
}

export function clockToggle(live, now = Date.now()) {
  if (clockRunning(live)) {
    return { set: { 'live.clockBase': clockMs(live, now), 'live.clockStartedAt': null }, remove: [] };
  }
  return { set: { 'live.clockStartedAt': now }, remove: [] };
}

// Subbing out banks the time played so far; subbing in notes the clock time.
export function courtToggle(live, playerId, now = Date.now()) {
  if (isOnCourt(live, playerId)) {
    return { set: { [`live.played.${playerId}`]: playedMs(live, playerId, now) }, remove: [`live.onCourt.${playerId}`] };
  }
  return { set: { [`live.onCourt.${playerId}`]: clockMs(live, now) }, remove: [] };
}

// Whole minutes for the box score when the game ends.
export function finalMinutes(live, playerIds, now = Date.now()) {
  return Object.fromEntries(playerIds.map((id) => [id, Math.round(playedMs(live, id, now) / 60000)]));
}
