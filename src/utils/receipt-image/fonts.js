/**
 * Getting the receipt's faces onto the canvas before anything is drawn.
 *
 * Canvas does not wait for a webfont and it does not complain: `fillText` with
 * an unloaded family silently paints the fallback, which on a receipt means a
 * proportional face in the money column and a figure column that no longer
 * lines up. Nothing throws, nothing logs, and the image just looks wrong.
 *
 * So: wait for `document.fonts.ready`, explicitly `load()` every weight/size
 * pair the renderer draws with, and then measure to confirm the face that
 * actually landed is monospaced. If it is not, fall back to the platform's own
 * mono stack deliberately rather than letting Geist Mono fail into Helvetica.
 */
import { FONTS } from './layout.js';

export const FAMILIES = {
  ui: "'Geist', ui-sans-serif, system-ui, -apple-system, sans-serif",
  mono: "'Geist Mono', ui-monospace, 'SF Mono', 'Menlo', monospace",
};

/** Chosen on purpose when Geist Mono did not arrive. Still mono. */
export const FALLBACK_MONO = "ui-monospace, 'SF Mono', 'Menlo', Consolas, monospace";

/** `500 17px 'Geist Mono', …` — the string both the measurer and the painter use. */
export function fontCss(font, families = FAMILIES) {
  return `${font.weight} ${font.size}px ${families[font.family] || families.ui}`;
}

/** Every distinct face the plan can draw with, deduplicated. */
export function requiredFaces(families = FAMILIES) {
  return [...new Set(Object.values(FONTS).map((f) => fontCss(f, families)))];
}

/**
 * Is the family currently set on this context actually monospaced?
 * Ten narrow glyphs against ten wide ones: identical in mono, nowhere near it
 * in anything proportional.
 */
export function isMonospaced(ctx) {
  const narrow = ctx.measureText('iiiiiiiiii').width;
  const wide = ctx.measureText('MMMMMMMMMM').width;
  const digits = ctx.measureText('1111111111').width;
  if (!(narrow > 0)) return false;
  return Math.abs(narrow - wide) < 0.5 && Math.abs(narrow - digits) < 0.5;
}

/**
 * Load the faces and report which mono family the caller should actually draw
 * with.
 *
 * @returns {Promise<{families: object, monoVerified: boolean}>}
 */
export async function ensureFonts(ctx) {
  const fonts = typeof document !== 'undefined' ? document.fonts : null;

  if (fonts) {
    try {
      await Promise.all(requiredFaces().map((face) => fonts.load(face, '0123456789₱.,')));
      await fonts.ready;
    } catch {
      // A load failure is not fatal — the measurement below is what decides.
    }
  }

  const probe = { ...FONTS.figure, weight: 400 };
  ctx.font = fontCss(probe);
  if (isMonospaced(ctx)) return { families: FAMILIES, monoVerified: true };

  const families = { ...FAMILIES, mono: FALLBACK_MONO };
  ctx.font = fontCss(probe, families);
  return { families, monoVerified: isMonospaced(ctx) };
}
