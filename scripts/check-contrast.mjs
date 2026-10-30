// Measures every foreground/background pair the theme actually ships, in both
// modes, against WCAG AA. Run it after any palette change: this file exists
// because a previous retheme shipped white-on-emerald buttons at 2.28:1 on
// every primary CTA, and nothing caught it until it was measured.
const lum = (hex) => {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const THEMES = {
  dark: {
    bg: '#0A0A0C', elevated: '#121318',
    primary: '#EDEDEF', secondary: '#A9AAB4', tertiary: '#8A8F98',
    accent: '#8B95E8', accentBright: '#A7AFF0', onAccent: '#0A0A0C',
    success: '#5FD39A', danger: '#FF8B7A',
    successFill: '#5FD39A', dangerFill: '#FF8B7A', onFill: '#0A0A0C',
  },
  light: {
    bg: '#F5F6F8', elevated: '#FFFFFF',
    primary: '#14161A', secondary: '#4C525C', tertiary: '#767D89',
    accent: '#4A55B8', accentBright: '#3B46A3', onAccent: '#FFFFFF',
    success: '#137B52', danger: '#C0392B',
    successFill: '#137B52', dangerFill: '#C0392B', onFill: '#FFFFFF',
  },
};

// [foreground, background, minimum, what it is]
const pairs = (t) => [
  [t.primary, t.bg, 4.5, 'body text on base'],
  [t.primary, t.elevated, 4.5, 'body text on elevated'],
  [t.secondary, t.bg, 4.5, 'secondary text on base'],
  [t.secondary, t.elevated, 4.5, 'secondary text on elevated'],
  [t.tertiary, t.bg, 3.0, 'tertiary / labels on base'],
  [t.tertiary, t.elevated, 3.0, 'tertiary / labels on elevated'],
  [t.accent, t.bg, 4.5, 'accent as text on base'],
  [t.accent, t.elevated, 4.5, 'accent as text on elevated'],
  [t.accentBright, t.bg, 3.0, 'bright accent / focus ring on base'],
  [t.success, t.bg, 4.5, 'settled amount on base'],
  [t.success, t.elevated, 4.5, 'settled amount on elevated'],
  [t.danger, t.bg, 4.5, 'owed amount on base'],
  [t.danger, t.elevated, 4.5, 'owed amount on elevated'],
  [t.onAccent, t.accent, 4.5, 'label on a filled accent button'],
  [t.onFill, t.successFill, 4.5, 'label on a filled success button'],
  [t.onFill, t.dangerFill, 4.5, 'label on a filled danger button'],
];

let failed = 0;
for (const [mode, t] of Object.entries(THEMES)) {
  console.log(`\n${mode.toUpperCase()}`);
  for (const [fg, bg, min, what] of pairs(t)) {
    const r = ratio(fg, bg);
    const ok = r >= min;
    if (!ok) failed++;
    console.log(
      `  ${ok ? 'ok  ' : 'FAIL'} ${r.toFixed(2).padStart(5)}:1  (needs ${min})  ${what}  ${fg} on ${bg}`,
    );
  }
}
console.log(failed ? `\n${failed} pair(s) below AA.` : '\nAll pairs clear AA.');
process.exit(failed ? 1 : 0);
