// Contrast gate — runs in CI, and a failure here fails the deploy.
//
// This script exists because a 2.28:1 CTA shipped once and nothing caught it.
// It then stayed green while `.btn-danger` shipped `color: white` at 2.69:1,
// because it measured `--on-danger-fill`: a token declared three times and
// used zero. So the rule for this file is now explicit:
//
//   Test the value the COMPONENT uses, not the token the system wishes it
//   used. Where a component composites — opacity, the grain overlay, a scrim
//   — composite it here the same way before measuring.
//
// Second rule: `--ink-3` is checked at 4.5, not 3.0. It ships on 13px mono
// micro-labels and placeholders, which is body-text territory. The old script
// asserted it at the large-text threshold, which is the single wrong number
// that made every one of these failures invisible.
//
// Everything below mirrors src/styles/tokens.css. If a value changes there
// and not here, that is the bug this file is for.

/* ------------------------------------------------------------------ math */
const rgb = (hex) => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const toHex = (a) => '#' + a.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

/** Source-over: one translucent layer onto an opaque one. */
const over = (fg, alpha, bg) => {
  const [a, b] = [rgb(fg), rgb(bg)];
  return toHex(a.map((v, i) => b[i] + (v - b[i]) * alpha));
};

const lum = (hex) => {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/* --------------------------------------------------------------- palette */
// The semantic layer of src/styles/tokens.css, twice: carbon, then paper.
const THEMES = {
  // Dark is the primary scene — a restaurant table at night — so it is the
  // one designed and measured first.
  carbon: {
    paper: '#141310',
    raised: '#1D1B16',
    sunk: '#0E0D0B',
    ink: '#EDE8DD',
    ink2: '#B5AEA2',
    ink3: '#8E8778',
    rule: '#332F28',
    ruleStrong: '#4A443A',
    stamp: '#E0695C',
    ledger: '#7FA98B',
  },
  paper: {
    paper: '#F6F3EC',
    raised: '#FCFAF5',
    sunk: '#EDE8DD',
    ink: '#1C1917',
    ink2: '#57534E',
    // DESIGN.md pins #6F6961, which clears 4.5 on --paper but lands at 4.44
    // on --paper-sunk — where it is the input placeholder. Darkened rather
    // than exempted, because lowering the threshold is how the last one
    // passed.
    ink3: '#6A645C',
    rule: '#DDD6C9',
    ruleStrong: '#C4BBAA',
    stamp: '#A32E25',
    ledger: '#3A6349',
  },
};

// The grain overlay is fixed over the entire app at --grain-opacity, so NO
// surface in this product is ever its bare token value. Desaturated
// fractalNoise averages to mid-grey; compositing that at 2.5% is the honest
// version of the background a component actually sits on.
const GRAIN = '#808080';
const GRAIN_ALPHA = 0.025;
const grained = (surface) => over(GRAIN, GRAIN_ALPHA, surface);

// .stamp ships at opacity .85, which pulls its ink toward whatever it sits
// on. The old script would have measured the token and missed this.
const STAMP_ALPHA = 0.85;

/* ----------------------------------------------------------------- pairs */
// [foreground, background, minimum, what ships at this pair]
const pairs = (t) => {
  const page = grained(t.paper);
  const sheet = grained(t.raised);
  const well = grained(t.sunk);

  // Buttons: the fills resolve from --btn-*, which resolve from semantics.
  // There is no literal colour anywhere in the component to measure instead.
  const solidBg = t.ink;
  const solidBgHover = t.ink2;
  const solidFg = t.paper;

  return [
    // --- body and chrome, on every surface a component can sit on --------
    [t.ink, page, 4.5, 'body text on the page'],
    [t.ink, sheet, 4.5, 'body text on a bill sheet'],
    [t.ink, well, 4.5, 'body text in a well'],
    [t.ink2, page, 4.5, 'secondary text on the page'],
    [t.ink2, sheet, 4.5, 'secondary text on a bill sheet'],
    [t.ink2, well, 4.5, 'secondary text in a well'],

    // --- the token that was checked at the wrong threshold ---------------
    [t.ink3, page, 4.5, 'micro-label (13px mono) on the page'],
    [t.ink3, sheet, 4.5, 'micro-label (13px mono) on a bill sheet'],
    [t.ink3, well, 4.5, 'input placeholder in a field'],
    [t.ink3, sheet, 4.5, 'row note under an item name'],

    // --- money, the only place colour is allowed -------------------------
    [t.stamp, page, 4.5, 'an amount owed to you, on the page'],
    [t.stamp, sheet, 4.5, 'an amount owed to you, on a bill sheet'],
    [t.ledger, page, 4.5, 'a settled amount on the page'],
    [t.ledger, sheet, 4.5, 'a settled amount on a bill sheet'],

    // --- Button, every variant and state that renders text ---------------
    [solidFg, solidBg, 4.5, 'Button variant=solid — label on the fill'],
    [solidFg, solidBgHover, 4.5, 'Button variant=solid :hover — label on the fill'],
    [t.ink, page, 4.5, 'Button variant=quiet — label at rest'],
    [t.ink, well, 4.5, 'Button variant=quiet :hover — label on the hover fill'],
    [t.ink3, page, 3.0, 'Button variant=quiet — its border, the only edge it has'],
    [t.ink, well, 4.5, 'Button variant=danger — label on its sunk fill'],
    [t.ink, well, 3.0, 'Button variant=danger — its 1.5px border'],
    [t.ink3, well, 4.5, 'Button :disabled — label on the disabled fill'],

    // --- Field -----------------------------------------------------------
    [t.ink, well, 4.5, 'Field — typed value'],
    [t.ink2, page, 4.5, 'Field — its label'],
    [t.ink3, page, 4.5, 'Field — its hint'],
    [t.ink3, well, 3.0, 'Field — the rule under it at rest'],
    [t.ink, well, 3.0, 'Field :focus — the rule under it'],

    // --- Focus ring. Ink, not accent, because accent means money here ----
    [t.ink, page, 3.0, 'focus ring on the page'],
    [t.ink, sheet, 3.0, 'focus ring on a bill sheet'],
    [t.ink, well, 3.0, 'focus ring against a well'],

    // --- Stamp, composited at its real .85 opacity -----------------------
    [over(t.ledger, STAMP_ALPHA, sheet), sheet, 4.5, 'Stamp SETTLED — its ink at 85%'],
    [
      over(t.ledger, STAMP_ALPHA, sheet),
      sheet,
      3.0,
      'Stamp SETTLED — its 1.5px pressed border at 85%',
    ],
    [over(t.ink2, STAMP_ALPHA, sheet), sheet, 4.5, 'Stamp PARTIAL — its ink at 85%'],
    [over(t.ink2, STAMP_ALPHA, sheet), sheet, 3.0, 'Stamp PARTIAL — its border at 85%'],

    // --- Sheet -----------------------------------------------------------
    [t.ink, sheet, 4.5, 'Sheet — its title'],
    [t.ink2, sheet, 4.5, 'Sheet — its close control'],

    // --- Avatar: the one round thing -------------------------------------
    [t.ink2, well, 4.5, 'Avatar — initials'],
  ];
};

// Hairlines and the dotted leader are decorative separators, not controls or
// text, so WCAG sets no minimum for them. They are printed anyway, because a
// separator nobody can see is still a bug — just not this gate's bug.
const informational = (t) => [
  [t.rule, grained(t.raised), 'hairline between rows'],
  [t.ruleStrong, grained(t.raised), 'the dotted leader'],
  [t.rule, grained(t.paper), 'section rule on the page'],
];

/* ------------------------------------------------------------------- run */
let failed = 0;
const worst = {};

for (const [name, t] of Object.entries(THEMES)) {
  console.log(
    `\n${name.toUpperCase()}  page ${grained(t.paper)} · sheet ${grained(t.raised)} · well ${grained(t.sunk)}  (grain composited at ${GRAIN_ALPHA})`,
  );

  for (const [fg, bg, min, what] of pairs(t)) {
    const r = ratio(fg, bg);
    const ok = r >= min;
    if (!ok) failed++;
    else if (!worst[name] || r - min < worst[name].margin) {
      worst[name] = { margin: r - min, r, min, what, fg, bg };
    }
    console.log(
      `  ${ok ? 'ok  ' : 'FAIL'} ${r.toFixed(2).padStart(5)}:1  (needs ${min.toFixed(1)})  ${what}` +
        `  ${fg} on ${bg}`,
    );
  }

  for (const [fg, bg, what] of informational(t)) {
    console.log(`  --   ${ratio(fg, bg).toFixed(2).padStart(5)}:1  (no minimum)  ${what}`);
  }
}

console.log('');
for (const [name, w] of Object.entries(worst)) {
  console.log(
    `${name}: thinnest passing pair ${w.r.toFixed(2)}:1 against ${w.min.toFixed(1)} — ${w.what}`,
  );
}

console.log(failed ? `\n${failed} pair(s) below AA.` : '\nAll pairs clear AA.');
process.exit(failed ? 1 : 0);
