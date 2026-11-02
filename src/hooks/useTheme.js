import { useCallback, useEffect, useState } from 'react';

const KEY = 'splurge.theme';
export const THEMES = ['auto', 'light', 'dark'];

// Matches the --bg-color of each mode, so the browser chrome and the
// pre-paint backdrop agree with the app instead of flashing against it.
const BAR = { light: '#FAFAFB', dark: '#0A0A0C' };

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
function apply(theme) {
  const root = document.documentElement;
  if (theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);

  const resolved = theme === 'auto' ? (systemIsDark() ? 'dark' : 'light') : theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', BAR[resolved]);
  return resolved;
}

export function useTheme() {
  const [theme, setThemeState] = useState(read);
  const [resolved, setResolved] = useState(() =>
    theme === 'auto' ? (systemIsDark() ? 'dark' : 'light') : theme,
  );

  useEffect(() => {
    setResolved(apply(theme));
    try {
      localStorage.setItem(KEY, theme);
    } catch { /* private mode — the theme just won't persist */ }
  }, [theme]);

  // On 'auto', follow the OS as it changes rather than only at startup.
  useEffect(() => {
    if (theme !== 'auto' || typeof matchMedia !== 'function') return undefined;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setResolved(apply('auto'));
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback((next) => {
    if (THEMES.includes(next)) setThemeState(next);
  }, []);

  return { theme, resolved, setTheme };
}
