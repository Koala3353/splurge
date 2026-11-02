// Measures every foreground/background pair the theme actually ships, in both
// modes, against WCAG AA. Run it after any palette change: this file exists
// because a previous retheme shipped white-on-emerald buttons at 2.28:1 on
// every primary CTA, and nothing caught it until it was measured.
//
// The glass direction made this harder in a way worth stating. Text no longer
// sits on a flat hex: it sits on a translucent panel, over an ambient wash,
// over the base. Measuring against the base colour would therefore measure a
// surface that is never actually on screen. So the layers are composited here
// first, and every pair is checked against the WORST case — the point where
// every wash blob overlaps, which is the lightest spot in dark mode and the
// darkest spot in light mode, i.e. the place contrast is thinnest in each.
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

const rgb = (hex) => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const hex = ([r, g, b]) =>
  '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

/** Source-over: one translucent layer onto an opaque one. */
const over = (fg, alpha, bg) => {
  const [a, b] = [rgb(fg), rgb(bg)];
  return hex(a.map((v, i) => b[i] + (v - b[i]) * alpha));
};
/** Stack several translucent layers, in paint order, onto a base. */
const stack = (base, layers) => layers.reduce((acc, [c, a]) => over(c, a, acc), base);

const THEMES = {
  // "Prism": neutral white glass with all the colour pushed into the wash
  // behind it. The glass itself is never tinted — that was the mistake in an
  // earlier attempt, and it is what makes glass read as coloured plastic.
  dark: {
    base: '#0A0A0C',
    // Every blob at once. No single point on screen is actually this bright,
    // which is the point: pass here and the real screen has headroom.
    // Measured down from a first pass that composited to #484b7b — a mid
    // purple that failed 12 pairs. At this strength the blur and the 185%
    // saturate still read the colour clearly; the alpha was doing far less
    // of that work than the saturate was.
    wash: [['#818CF8', 0.099], ['#EC4899', 0.072], ['#2DD4BF', 0.063], ['#6366F1', 0.090]],
    panel: ['#FFFFFF', 0.075],
    primary: '#F2F2F4', secondary: '#AFAFBA', tertiary: '#9898A4',
    // Indigo-400 is a FILL colour, not a text colour: #818CF8 as text over
    // glass is 4.16:1. Text uses indigo-300 and fills use indigo-400, which
    // is why these are two tokens rather than one with an opacity on it.
    accent: '#A5B4FC', accentFill: '#818CF8', accentBright: '#C7D2FE', onAccent: '#0A0A0C',
    success: '#5EEAD4', danger: '#FDA4AF',
    successFill: '#5EEAD4', dangerFill: '#FB7185', onFill: '#0A0A0C',
  },
  // Light mode inverts which direction is dangerous: the wash DARKENS the
  // page, so dark text loses contrast rather than gaining it, and the panel
  // (white at high opacity) is the safe surface rather than the risky one.
  light: {
    base: '#FAFAFB',
    wash: [['#6366F1', 0.084], ['#EC4899', 0.060], ['#14B8A6', 0.060]],
    panel: ['#FFFFFF', 0.72],
    primary: '#18181B', secondary: '#4F4F59', tertiary: '#67676F',
    accent: '#4F46E5', accentFill: '#4F46E5', accentBright: '#4338CA', onAccent: '#FFFFFF',
    success: '#115E59', danger: '#BE123C',
    successFill: '#115E59', dangerFill: '#BE123C', onFill: '#FFFFFF',
  },
};

// [foreground, background, minimum, what it is]
const pairs = (t) => {
  const washed = stack(t.base, t.wash);       // page, where the wash is strongest
  const glass = over(t.panel[0], t.panel[1], washed); // a card sitting on that spot
  return [
    [t.primary, t.base, 4.5, 'body text on bare base'],
    [t.primary, washed, 4.5, 'body text on the wash at full strength'],
    [t.primary, glass, 4.5, 'body text on glass over that wash'],
    [t.secondary, washed, 4.5, 'secondary text on the wash'],
    [t.secondary, glass, 4.5, 'secondary text on glass'],
    [t.tertiary, washed, 3.0, 'tertiary / mono labels on the wash'],
    [t.tertiary, glass, 3.0, 'tertiary / mono labels on glass'],
    [t.accent, washed, 4.5, 'accent as text on the wash'],
    [t.accent, glass, 4.5, 'accent as text on glass'],
    [t.accentBright, glass, 3.0, 'bright accent / focus ring on glass'],
    [t.success, washed, 4.5, 'settled amount on the wash'],
    [t.success, glass, 4.5, 'settled amount on glass'],
    [t.danger, washed, 4.5, 'owed amount on the wash'],
    [t.danger, glass, 4.5, 'owed amount on glass'],
    [t.onAccent, t.accentFill, 4.5, 'label on a filled accent button'],
    [t.onFill, t.successFill, 4.5, 'label on a filled success button'],
    [t.onFill, t.dangerFill, 4.5, 'label on a filled danger button'],
  ];
};

let failed = 0;
for (const [mode, t] of Object.entries(THEMES)) {
  const washed = stack(t.base, t.wash);
  console.log(`\n${mode.toUpperCase()}  base ${t.base} → wash peak ${washed} → glass ${over(t.panel[0], t.panel[1], washed)}`);
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
