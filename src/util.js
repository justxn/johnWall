// Small formatting helpers. Dates are stored as local 'YYYY-MM-DD' strings and
// times as 'HH:MM' (24h), so they sort as plain strings.

const pad = (n) => String(n).padStart(2, '0');

export const todayISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const parseISO = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

// "Wed, Nov 4"; the year is only shown when it isn't the current one.
export const fmtDate = (iso, { weekday = true } = {}) => {
  if (!iso) return '';
  const date = parseISO(iso);
  const opts = { month: 'short', day: 'numeric' };
  if (weekday) opts.weekday = 'short';
  if (date.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return date.toLocaleDateString(undefined, opts);
};

// Pieces for the calendar-style date block: { dow: 'WED', day: 4, month: 'NOV' }.
export const dateParts = (iso) => {
  const date = parseISO(iso);
  return {
    dow: date.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase(),
    day: date.getDate(),
    month: date.toLocaleDateString(undefined, { month: 'short' }).toUpperCase(),
  };
};

// '18:30' -> '6:30 PM'
export const fmtTime = (hhmm) => {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

// Game clock: 754000 -> '12:34'
export const fmtClock = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
};

export const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

export const playerName = (players, id) => players.find((p) => p.id === id)?.name ?? 'Unknown';

// Opponent names are free text, so compare them loosely.
export const normName = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

export const initials = (name) =>
  String(name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?';
