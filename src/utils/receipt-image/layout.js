/**
 * Receipt image layout — pure maths, no canvas, no DOM.
 *
 * `planReceipt` takes a receipt model and a text measurer and returns a flat
 * list of draw operations plus the size of the sheet they fit on. Nothing here
 * paints; `paint.js` executes the list and asks no questions. Splitting it this
 * way is what makes the part that actually goes wrong — column alignment, name
 * wrapping, a leader that overshoots its figure by a pixel — testable in Node
 * without a browser.
 *
 * Every size below is a CSS pixel. The device pixel ratio is applied once, at
 * the canvas, by scaling the context — see receiptImage.js.
 */

/* ------------------------------------------------------------- the palette */

/**
 * LIGHT PAPER, ALWAYS — regardless of the user's theme.
 *
 * Do not "fix" this by reading the active theme. A dark image reads as a
 * screenshot of an app; a light one reads as a receipt, which is the entire
 * point of the feature. It also sits correctly in every chat client, where a
 * dark card lands on a dark background and disappears.
 *
 * These are the paper-theme values from styles/tokens.css. If a value moves
 * there and not here, that is the bug this comment is for.
 */
export const PAPER = {
  sheet: '#FCFAF5', // --paper-raised
  ink: '#1C1917', // --ink
  ink2: '#57534E', // --ink-2
  ink3: '#6A645C', // --ink-3
  rule: '#DDD6C9', // --rule
  ruleStrong: '#C4BBAA', // --rule-strong
  ledger: '#3A6349', // --ledger, settled
};

/* ------------------------------------------------------------ the geometry */

export const GEOMETRY = {
  width: 400, // the narrow column. A receipt is 58–80mm wide.
  padX: 26,
  padTop: 26,
  padBottom: 22,
  perf: 10, // --perf-size
  leaderGap: 8, // --space-2 either side of the dotted run
  dotStep: 4,
  dotRadius: 0.75,
  hairline: 1,
  rowGap: 7,
  blockGap: 16,
  maxNameLines: 2,
};

/**
 * The seven steps of the type scale, as the image uses them. Mono carries
 * every figure and every machine-printed field; Geist carries the names.
 */
export const FONTS = {
  title: { family: 'ui', weight: 600, size: 24, leading: 1.15 },
  meta: { family: 'mono', weight: 400, size: 13, leading: 1.3, tracking: '0.08em', caps: true },
  label: { family: 'mono', weight: 500, size: 13, leading: 1.3, tracking: '0.08em', caps: true },
  name: { family: 'ui', weight: 400, size: 17, leading: 1.35 },
  person: { family: 'ui', weight: 500, size: 17, leading: 1.35 },
  figure: { family: 'mono', weight: 400, size: 17, leading: 1.35 },
  figureStrong: { family: 'mono', weight: 500, size: 17, leading: 1.35 },
  // No tracking on the figures. Canvas letter-spacing adds a trailing
  // advance, which nudges right-aligned text off the money column — and that
  // column is the one thing on this image that has to be exact.
  total: { family: 'mono', weight: 500, size: 32, leading: 1.1 },
  totalLabel: { family: 'ui', weight: 500, size: 20, leading: 1.2 },
  pay: { family: 'mono', weight: 400, size: 15, leading: 1.35 },
  mark: { family: 'mono', weight: 500, size: 13, leading: 1.3, tracking: '0.08em', caps: true },
};

const lineHeight = (font) => Math.round(font.size * font.leading);

/**
 * Where the baseline falls below the top of a line box. Text is drawn with
 * `textBaseline: 'top'`, so this is the one number that ties the dotted
 * leader — which is geometry, not text — to the row it belongs to.
 */
const BASELINE = 0.78;
export const baselineOf = (font, top) => top + font.size * BASELINE;

/** Applied before measuring and before drawing, so the two agree. */
export const textOf = (value, font) => {
  const s = (value ?? '').toString();
  return font?.caps ? s.toUpperCase() : s;
};

/* ------------------------------------------------------------------- wrap */

const ELLIPSIS = '…';

/**
 * Trim a run until it fits, then mark it as trimmed. Used for the last line
 * of a name that has run out of lines, and for a single word too long to wrap.
 */
export function truncateToWidth(text, maxWidth, measure, font) {
  if (measure(text, font) <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(text.slice(0, mid).trimEnd() + ELLIPSIS, font) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo <= 0 ? ELLIPSIS : text.slice(0, lo).trimEnd() + ELLIPSIS;
}

/**
 * Greedy word wrap with a hard line budget. A name that will not fit in the
 * budget is truncated on its last line rather than allowed to run under the
 * price column, which is the failure this whole function exists to prevent.
 *
 * @returns {string[]} one entry per rendered line, at most `maxLines`.
 */
export function wrapLines(text, maxWidth, measure, font, maxLines = 2) {
  const words = (text ?? '').toString().trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];

  const lines = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measure(candidate, font) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    if (lines.length === maxLines) {
      // Out of lines. Put what is left back onto the last one and trim it.
      const rest = [lines.pop(), word].join(' ');
      lines.push(truncateToWidth(rest, maxWidth, measure, font));
      return lines;
    }
    current = measure(word, font) <= maxWidth
      ? word
      : truncateToWidth(word, maxWidth, measure, font);
  }

  if (current) lines.push(current);
  return lines.slice(0, maxLines);
}

/* ----------------------------------------------------------- the leader */

/**
 * Dot centres for a run from x1 to x2, inclusive of both ends.
 *
 * The run fills the gap exactly: the first dot sits on x1 and the last on x2,
 * with the step stretched or squeezed to divide the span evenly. A fixed step
 * leaves a ragged tail short of the figure column, and that is immediately
 * visible on a design whose signature is this one mark.
 */
export function leaderDots(x1, x2, step = GEOMETRY.dotStep) {
  const span = x2 - x1;
  if (!(span > step)) return [];
  const count = Math.max(1, Math.round(span / step));
  const actual = span / count;
  const dots = [];
  // The ends are pinned rather than accumulated, so float drift cannot put a
  // dot a hair past the figure it is pointing at.
  for (let i = 0; i <= count; i += 1) dots.push(i === count ? x2 : x1 + actual * i);
  return dots;
}

/* -------------------------------------------------------------- the plan */

/**
 * @param {object}   model     - from model.js
 * @param {object}   deps
 * @param {Function} deps.measure - (text, font) => width in CSS px
 * @returns {{ width:number, height:number, ops:Array }}
 */
export function planReceipt(model, { measure }) {
  const g = GEOMETRY;
  const left = g.padX;
  const right = g.width - g.padX;
  const inner = right - left;
  const ops = [];
  let y = g.perf + g.padTop;

  const text = (value, font, x, align, color) => {
    ops.push({ type: 'text', text: textOf(value, font), font, x, y, align, color });
  };

  const rule = (color = PAPER.rule, strong = false) => {
    ops.push({
      type: 'rule',
      x1: left,
      x2: right,
      y: Math.round(y) + 0.5,
      color: strong ? PAPER.ruleStrong : color,
      width: strong ? 1.5 : g.hairline,
    });
    y += strong ? 1.5 : g.hairline;
  };

  /**
   * One receipt line: a name that may wrap, a dotted leader, and a figure
   * right-aligned on the shared column. The leader and the figure both sit on
   * the LAST line of the name, so the dots never run alongside a line of text
   * above the figure they belong to.
   */
  const line = ({ name, figure, nameFont, figureFont, nameColor, figureColor }) => {
    const figureWidth = measure(textOf(figure, figureFont), figureFont);
    const nameMax = inner - figureWidth - g.leaderGap * 2;
    const lines = wrapLines(name, Math.max(nameMax, 24), measure, nameFont, g.maxNameLines);
    const lh = lineHeight(nameFont);

    lines.forEach((part, i) => {
      text(part, nameFont, left, 'left', nameColor);
      const last = i === lines.length - 1;
      if (last) {
        const nameEnd = left + measure(part, nameFont);
        const figureStart = right - figureWidth;
        const x1 = nameEnd + g.leaderGap;
        const x2 = figureStart - g.leaderGap;
        ops.push({
          type: 'leader',
          x1,
          x2,
          dots: leaderDots(x1, x2),
          // Just clear of the baseline, the way the CSS leader sits.
          y: Math.round(baselineOf(nameFont, y)) - 2,
          color: PAPER.ruleStrong,
          radius: g.dotRadius,
        });
        ops.push({
          type: 'text',
          text: textOf(figure, figureFont),
          font: figureFont,
          x: right,
          y,
          align: 'right',
          color: figureColor,
        });
      }
      y += lh;
    });
    y += g.rowGap;
  };

  /* ---- the head ---------------------------------------------------- */
  text(model.title, FONTS.title, g.width / 2, 'center', PAPER.ink);
  y += lineHeight(FONTS.title) + 4;

  if (model.date) {
    text(model.date, FONTS.meta, g.width / 2, 'center', PAPER.ink3);
    y += lineHeight(FONTS.meta);
  }

  y += g.blockGap;
  rule(PAPER.ruleStrong, true);
  y += g.blockGap - 4;

  /* ---- the items --------------------------------------------------- */
  model.items.forEach((item) => {
    line({
      name: item.name,
      figure: item.figure,
      nameFont: FONTS.name,
      figureFont: FONTS.figure,
      nameColor: PAPER.ink,
      figureColor: PAPER.ink,
    });
  });

  /* ---- fees and the tip -------------------------------------------- */
  if (model.fees.length) {
    y += 2;
    rule();
    y += g.blockGap - 6;
    if (model.subtotal) {
      line({
        name: 'Subtotal',
        figure: model.subtotal,
        nameFont: FONTS.name,
        figureFont: FONTS.figure,
        nameColor: PAPER.ink2,
        figureColor: PAPER.ink2,
      });
    }
    model.fees.forEach((fee) => {
      line({
        name: fee.name,
        figure: fee.figure,
        nameFont: FONTS.name,
        figureFont: FONTS.figure,
        nameColor: PAPER.ink2,
        figureColor: PAPER.ink2,
      });
    });
  }

  /* ---- the total --------------------------------------------------- */
  y += 2;
  rule(PAPER.ruleStrong, true);
  y += g.blockGap - 2;

  // The word and the figure share a baseline, so the larger figure's line box
  // starts higher by exactly the difference between the two.
  const totalBaselineShift = Math.round(
    baselineOf(FONTS.total, 0) - baselineOf(FONTS.totalLabel, 0),
  );
  text('Total', FONTS.totalLabel, left, 'left', PAPER.ink);
  ops.push({
    type: 'text',
    text: textOf(model.total, FONTS.total),
    font: FONTS.total,
    x: right,
    y: y - totalBaselineShift,
    align: 'right',
    color: PAPER.ink,
  });
  y += lineHeight(FONTS.total) - totalBaselineShift + g.blockGap - 4;

  /* ---- the fold, then who owes what -------------------------------- */
  rule(PAPER.ruleStrong, true);
  y += g.blockGap - 4;

  text('Who owes what', FONTS.label, left, 'left', PAPER.ink3);
  y += lineHeight(FONTS.label) + 8;

  model.people.forEach((person) => {
    line({
      name: person.name,
      figure: person.figure,
      nameFont: FONTS.person,
      figureFont: FONTS.figureStrong,
      nameColor: PAPER.ink,
      figureColor: person.settled ? PAPER.ledger : PAPER.ink,
    });
  });

  /* ---- how to pay, only when asked for ----------------------------- */
  if (model.payLine) {
    y += 2;
    rule();
    y += g.blockGap - 6;
    text('Send it to', FONTS.label, left, 'left', PAPER.ink3);
    y += lineHeight(FONTS.label) + 4;
    text(model.payLine, FONTS.pay, left, 'left', PAPER.ink);
    y += lineHeight(FONTS.pay);
  }

  /* ---- the mark ---------------------------------------------------- */
  y += g.blockGap;
  text('Splurge', FONTS.mark, g.width / 2, 'center', PAPER.ink3);
  y += lineHeight(FONTS.mark);

  y += g.padBottom + g.perf;

  return { width: g.width, height: Math.ceil(y), ops };
}
