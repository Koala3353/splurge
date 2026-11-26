import { useCallback, useEffect, useState } from 'react';

const KEY = 'splurge.theme';
export const THEMES = ['auto', 'light', 'dark'];

// --paper in each mode: carbon and paper. The browser chrome, the pre-paint
// backdrop in index.html and the app all have to name the same two colours,
// or the status bar sits a shade off the page under it. These lagged a
// retheme behind and were still writing the old palette's #0A0A0C / #FAFAFB.
const BAR = { light: '#F6F3EC', dark: '#141310' };

const read = () => {
  try {
    const v = localStorage.getItem(KEY);
    return THEMES.includes(v) ? v : 'auto';
  } catch {
    return 'auto';
  }
};

const systemIsDark = () =>
  typeof matchMedia === 'function'
    ? matchMedia('(prefers-color-scheme: dark)').matches
    : true;

/**
 * Applies the chosen theme to the document.
 *
 * 'auto' removes the attribute entirely rather than writing the resolved
 * value, so the stylesheet's own prefers-color-scheme query stays in charge
 * and the app follows the OS live — including a change made while it is open.
 */
/** Which of the two real modes a setting means right now. Pure. */
export function resolveTheme(theme, systemDark) {
  if (theme === 'light' || theme === 'dark') return theme;
  return systemDark ? 'dark' : 'light';
}

function apply(theme, resolved) {
  const root = document.documentElement;
  if (theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);

  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', BAR[resolved]);
}

export function useTheme() {
  const [theme, setThemeState] = useState(read);
  // The OS preference is external state, so it is subscribed to and written
  // from the listener — not recomputed into state from inside an effect, which
  // costs a second render pass on every theme change.
  const [systemDark, setSystemDark] = useState(systemIsDark);
  const resolved = resolveTheme(theme, systemDark);

  useEffect(() => {
    if (typeof matchMedia !== 'function') return undefined;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    apply(theme, resolved);
    try {
      localStorage.setItem(KEY, theme);
    } catch { /* private mode — the theme just won't persist */ }
  }, [theme, resolved]);

  const setTheme = useCallback((next) => {
    if (THEMES.includes(next)) setThemeState(next);
  }, []);

  return { theme, resolved, setTheme };
}
