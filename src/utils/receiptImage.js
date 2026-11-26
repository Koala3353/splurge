/**
 * A split, drawn as a printed receipt, as a PNG you can post into a group
 * chat.
 *
 * Drawn, not screenshotted. There is no html2canvas here and there is not
 * going to be: the interface is already a receipt, the layout of that receipt
 * is forty lines of arithmetic, and a DOM screenshotter would cost a
 * dependency, a frame of the user's actual theme, and the one thing this image
 * must have — a figure column that is exact.
 *
 * The pieces:
 *   receipt-image/model.js   what goes on the image, and the privacy rules
 *   receipt-image/layout.js  pure layout maths -> a list of draw operations
 *   receipt-image/fonts.js   getting Geist Mono onto the canvas, verifiably
 *   receipt-image/paint.js   executing the list
 *
 * Adding a second entry point is one import and one prop; see ShareSheet.
 */
import { GEOMETRY, planReceipt } from './receipt-image/layout.js';
import { ensureFonts } from './receipt-image/fonts.js';
import { measurerFor, paintReceipt } from './receipt-image/paint.js';
import { buildReceipt } from './receipt-image/model.js';

export { buildReceipt } from './receipt-image/model.js';
export { planReceipt, GEOMETRY, PAPER } from './receipt-image/layout.js';

/**
 * How many device pixels per CSS pixel to draw at.
 *
 * Below 2 the text is mush the moment the image is opened full-screen on a
 * phone; above 3 the file grows for nothing. The context is scaled once, so
 * every number in layout.js stays a CSS pixel.
 */
export function pixelRatio(dpr) {
  const raw = Number.isFinite(dpr)
    ? dpr
    : typeof window !== 'undefined'
      ? window.devicePixelRatio
      : 2;
  if (!Number.isFinite(raw) || raw <= 0) return 2;
  return Math.min(3, Math.max(2, Math.round(raw)));
}

/** A filename a chat client will show as what it is. */
export function receiptFileName(title) {
  const slug = (title || 'split')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${slug || 'split'}.png`;
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('The browser produced no image.'));
    }, 'image/png');
  });
}

/**
 * Draw a bill as a receipt and hand back a PNG.
 *
 * @param {object} input  - everything buildReceipt takes: bill, dues, nameOf,
 *                          meId, payInfo, includePayInfo
 * @param {object} [opts] - { dpr } to force a ratio, for tests
 * @returns {Promise<{blob: Blob, url: string, width: number, height: number,
 *                    fileName: string, monoVerified: boolean}>}
 */
export async function renderReceiptImage(input, { dpr } = {}) {
  const model = buildReceipt(input);
  const scale = pixelRatio(dpr);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw the image.');

  const { families, monoVerified } = await ensureFonts(ctx);
  const measure = measurerFor(ctx, families);
  const plan = planReceipt(model, { measure });

  // Resizing a canvas resets its context, so the scale is applied after the
  // measuring pass and everything below stays in CSS pixels.
  canvas.width = Math.round(plan.width * scale);
  canvas.height = Math.round(plan.height * scale);
  ctx.scale(scale, scale);
  paintReceipt(ctx, plan, { families });

  const blob = await canvasToBlob(canvas);
  return {
    blob,
    url: URL.createObjectURL(blob),
    width: canvas.width,
    height: canvas.height,
    cssWidth: GEOMETRY.width,
    fileName: receiptFileName(model.title),
    monoVerified,
  };
}

/* ------------------------------------------------------------- the exit */

/**
 * Can this browser hand a PNG to another app right now?
 *
 * Deliberately synchronous and deliberately separate from the text check in
 * share/send.js: file sharing is supported in meaningfully fewer places than
 * text sharing, and `navigator.share` existing says nothing about whether a
 * file payload will be accepted. `canShare({ files })` is the only honest test
 * and it has to be asked with a real File.
 */
export function canShareImage(file) {
  if (typeof navigator === 'undefined') return false;
  if (typeof navigator.share !== 'function') return false;
  if (typeof navigator.canShare !== 'function') return false;
  if (!file) return false;
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/** A `File` from an already-rendered blob. Synchronous, so a tap can use it. */
export function fileFrom(blob, fileName = 'split.png') {
  if (!blob || typeof File !== 'function') return null;
  try {
    return new File([blob], fileName, { type: 'image/png' });
  } catch {
    return null;
  }
}

/**
 * Save the image instead. The object URL is revoked on the next frame — not
 * immediately, because Safari has not finished reading it yet when the click
 * handler returns.
 */
export function downloadImage(blob, fileName = 'split.png') {
  if (!blob || typeof document === 'undefined') return false;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
