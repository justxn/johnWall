// Light, dark, or follow the phone's setting. The choice is a per-device
// preference, so it lives in localStorage (which can throw in private windows).
const KEY = 'hoops.theme';
const dark = matchMedia('(prefers-color-scheme: dark)');

export function getTheme() {
  try {
    return localStorage.getItem(KEY) || 'system';
  } catch {
    return 'system';
  }
}

function apply(theme) {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
  // Match the browser/status bar to the page background.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(root).getPropertyValue('--bg').trim() || '#f4f5f7';
}

export function setTheme(theme) {
  try {
    if (theme === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch { /* ignore */ }
  apply(theme);
}

export function initTheme() {
  apply(getTheme());
  dark.addEventListener('change', () => apply(getTheme()));
}
