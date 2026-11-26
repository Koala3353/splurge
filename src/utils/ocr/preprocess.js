// Canvas-level preprocessing: render, rotate, deskew, crop detection and the
// perspective flatten. The arithmetic lives in binarize.js / geometry.js; this
// module is the thin layer that moves pixels between canvases.

import { createCanvas, ctx2d, encodeThumbnail } from './env.js';
import {
  adaptiveThreshold, contrastStretch, flattenIllumination, globalThreshold,
  grayscale, histogramOf, otsuThreshold,
} from './binarize.js';

// Paper/table split, measured on reflectance rather than on brightness.
// Returns the flattened gray buffer alongside its threshold so callers can do
// their profiling on the same pixels the threshold was derived from.
function paperSplit(d, w, h, flatten = true) {
  const { gray, hist, n } = grayscale(d, w, h);
  if (!flatten) return { gray, t: otsuThreshold(hist, n), n };
  const flat = flattenIllumination(gray, w, h);
  return { gray: flat, t: otsuThreshold(histogramOf(flat), n), n };
}
import {
  denseBand, dist, estimateSkew, largestBrightComponent, perspectiveStrength,
  projectionVariances, quadFromComponent, quadIsPlausible, unwarpPixels,
} from './geometry.js';

export const TARGET_SHORT = 1100;   // receipt width in px; keeps thermal glyphs ~35px
export const MAX_PIXELS = 4.2e6;    // ImageData ceiling, so mid-range phones survive
// The unwarp samples every destination pixel in JS on the main thread, so it
// gets a tighter ceiling than the plain renders: at 4.2M that loop is ~100M
// operations holding two full pixel buffers, which freezes the UI for seconds
// on a mid-range phone.
export const UNWARP_MAX_PIXELS = 2.2e6;

/** Variants mutate pixels in place, so each source/variant pair needs a copy. */
export function copyCanvas(src) {
  const c = createCanvas(src.width, src.height);
  ctx2d(c).drawImage(src, 0, 0);
  return c;
}

// A small JPEG of exactly what the engine saw. This is the fastest way to tell
// a bad crop from a threshold that erased faint print — both look identical in
// the item list and completely different here.
export function thumbnail(canvas, maxW = 260) {
  try {
    const scale = Math.min(1, maxW / canvas.width);
    const c = createCanvas(Math.round(canvas.width * scale), Math.round(canvas.height * scale));
    c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
    return encodeThumbnail(c);
  } catch { return null; }
}

// Render a region of the original photo at a text-legible size. Scaling by the
// SHORT side matters: driving the longest side (as this once did) leaves a long
// receipt about 400px wide, putting thermal print near 14px cap height — below
// what Tesseract reads reliably — while a short receipt comes out fine. That
// asymmetry is exactly why scans used to work "sometimes".
export function renderRegion(img, box) {
  const b = box || { x: 0, y: 0, w: img.width, h: img.height };
  let scale = TARGET_SHORT / Math.max(1, Math.min(b.w, b.h));
  scale = Math.min(scale, 1.6);                       // upscaling invents no detail
  if (b.w * b.h * scale * scale > MAX_PIXELS) scale = Math.sqrt(MAX_PIXELS / (b.w * b.h));
  const c = createCanvas(b.w * scale, b.h * scale);
  const ctx = ctx2d(c);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, b.x, b.y, b.w, b.h, 0, 0, c.width, c.height);
  return c;
}

// Apply a variant in place. Three are offered because no single one wins on
// real receipts: binarization rescues dark or unevenly-lit surfaces but can
// erase faint dot-matrix print outright, a contrast stretch keeps those faint
// strokes alive, and the untouched photo sometimes beats both on a crisp,
// well-lit shot.
export function applyVariant(canvas, variant) {
  if (variant === 'original') return canvas;
  const ctx = ctx2d(canvas);
  try {
    const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
    if (variant === 'threshold') adaptiveThreshold(id.data, canvas.width, canvas.height);
    else contrastStretch(id.data, canvas.width, canvas.height);
    ctx.putImageData(id, 0, 0);
  } catch { /* tainted canvas — leave the plain draw */ }
  return canvas;
}

// Locate the receipt by finding the paper, not the ink. An earlier version
// profiled dark pixels, which fails on exactly the surfaces that need it most:
// wood grain, tiles or a patterned tablecloth scatter "ink" across the whole
// frame, the bounding box grows to fill it, and the crop is discarded. Paper is
// the more reliable signal — a receipt is a large, bright, contiguous block,
// and Otsu picks the paper/table split without a hand-tuned constant.
export function detectCrop(img, { flattenLight = true } = {}) {
  const ANALYSIS = 1000;
  const scale = Math.min(1, ANALYSIS / Math.max(img.width, img.height));
  const aw = Math.max(1, Math.round(img.width * scale));
  const ah = Math.max(1, Math.round(img.height * scale));
  const probe = createCanvas(aw, ah);
  const ctx = ctx2d(probe);
  ctx.drawImage(img, 0, 0, aw, ah);
  try {
    const d = ctx.getImageData(0, 0, aw, ah).data;
    const { gray, t, n } = paperSplit(d, aw, ah, flattenLight);
    const rows = new Float64Array(ah);
    const cols = new Float64Array(aw);
    let bright = 0;
    for (let y = 0; y < ah; y++) {
      const yo = y * aw;
      for (let x = 0; x < aw; x++) {
        if (gray[yo + x] > t) { rows[y]++; cols[x]++; bright++; }
      }
    }
    // Paper should be a substantial but not total share of the frame.
    const frac = bright / n;
    if (frac < 0.04 || frac > 0.9) return null;

    const v = denseBand(rows, ah);
    const hh = denseBand(cols, aw);
    if (!v || !hh) return null;

    const pad = Math.round(Math.max(aw, ah) * 0.015);
    const x0 = Math.max(0, hh[0] - pad);
    const y0 = Math.max(0, v[0] - pad);
    const x1 = Math.min(aw - 1, hh[1] + pad);
    const y1 = Math.min(ah - 1, v[1] + pad);
    if (x1 - x0 < aw * 0.08 || y1 - y0 < ah * 0.08) return null;   // implausibly small

    const inv = 1 / scale;
    const box = {
      x: Math.round(x0 * inv), y: Math.round(y0 * inv),
      w: Math.round((x1 - x0 + 1) * inv), h: Math.round((y1 - y0 + 1) * inv),
    };
    // Not worth racing a crop that barely shrinks the frame.
    if (box.w * box.h > img.width * img.height * 0.92) return null;
    return box;
  } catch { return null; }
}

// Find the paper as a quadrilateral and, when it is genuinely skewed, return a
// flattened render of it. Returns null when the shot is already square-on, so
// the cheaper crop path keeps its sharpness.
export function buildPerspective(img, { minStrength = 0.06, plausibleQuadOnly = true, flattenLight = true } = {}) {
  const ANALYSIS = 900;
  const scale = Math.min(1, ANALYSIS / Math.max(img.width, img.height));
  const aw = Math.max(1, Math.round(img.width * scale));
  const ah = Math.max(1, Math.round(img.height * scale));
  const probe = createCanvas(aw, ah);
  const ctx = ctx2d(probe);
  ctx.drawImage(img, 0, 0, aw, ah);
  try {
    const d = ctx.getImageData(0, 0, aw, ah).data;
    const { gray, t, n } = paperSplit(d, aw, ah, flattenLight);
    const blob = largestBrightComponent(gray, aw, ah, t);
    if (!blob) return null;
    const frac = blob.count / n;
    if (frac < 0.05 || frac > 0.95) return null;
    const q = quadFromComponent(blob.comp, blob.label, aw, ah);
    if (!q) return null;
    if (plausibleQuadOnly && !quadIsPlausible(q, aw, ah)) return null;

    const strength = perspectiveStrength(q);
    if (strength < minStrength) return null;          // effectively square-on already

    // True edge lengths give the receipt's real proportions, which a bounding
    // box cannot: a tilted receipt's box is both too wide and too short.
    const wOut = Math.max(dist(q.tl, q.tr), dist(q.bl, q.br));
    const hOut = Math.max(dist(q.tl, q.bl), dist(q.tr, q.br));
    if (wOut < 20 || hOut < 20) return null;

    const inv = 1 / scale;
    const pts = [q.tl, q.tr, q.br, q.bl].map((pt) => ({ x: pt.x * inv, y: pt.y * inv }));
    const minX = Math.max(0, Math.floor(Math.min(...pts.map((pt) => pt.x))));
    const minY = Math.max(0, Math.floor(Math.min(...pts.map((pt) => pt.y))));
    const maxX = Math.min(img.width, Math.ceil(Math.max(...pts.map((pt) => pt.x))));
    const maxY = Math.min(img.height, Math.ceil(Math.max(...pts.map((pt) => pt.y))));
    const boxW = maxX - minX; const boxH = maxY - minY;
    if (boxW < 10 || boxH < 10) return null;

    let outScale = TARGET_SHORT / Math.max(1, Math.min(wOut, hOut) * inv);
    outScale = Math.min(outScale, 1.6);
    let outW = Math.max(1, Math.round(wOut * inv * outScale));
    let outH = Math.max(1, Math.round(hOut * inv * outScale));
    if (outW * outH > UNWARP_MAX_PIXELS) {
      const k = Math.sqrt(UNWARP_MAX_PIXELS / (outW * outH));
      outW = Math.round(outW * k); outH = Math.round(outH * k);
    }
    return buildPerspectiveAt(img, pts, minX, minY, boxW, boxH, outW, outH, strength);
  } catch { return null; }
}

function buildPerspectiveAt(img, pts, minX, minY, boxW, boxH, outW, outH, strength) {
  // Source render capped so the sampling buffer stays mobile-safe.
  const srcScale = Math.min(1.0, Math.sqrt(UNWARP_MAX_PIXELS / (boxW * boxH)));
  const sw = Math.max(1, Math.round(boxW * srcScale));
  const sh = Math.max(1, Math.round(boxH * srcScale));
  const src = createCanvas(sw, sh);
  const sctx = ctx2d(src);
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(img, minX, minY, boxW, boxH, 0, 0, sw, sh);
  const local = pts.map((pt) => ({ x: (pt.x - minX) * srcScale, y: (pt.y - minY) * srcScale }));
  const quad = { tl: local[0], tr: local[1], br: local[2], bl: local[3] };
  const sd = sctx.getImageData(0, 0, sw, sh).data;
  const pixels = unwarpPixels(sd, sw, sh, quad, outW, outH);
  if (!pixels) return null;
  const out = createCanvas(outW, outH);
  const octx = ctx2d(out);
  const od = octx.createImageData(outW, outH);
  od.data.set(pixels);
  octx.putImageData(od, 0, 0);
  return { canvas: out, strength };
}

/** Rotate a canvas by ±90° (dir > 0 = clockwise). Dimensions swap. */
export function rotate90(src, dir) {
  const w = src.width;
  const h = src.height;
  const out = createCanvas(h, w);
  const c = out.getContext('2d');
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, out.width, out.height);
  c.translate(h / 2, w / 2);
  c.rotate((dir >= 0 ? 1 : -1) * Math.PI / 2);
  c.drawImage(src, -w / 2, -h / 2);
  return out;
}

// Rotate the canvas to level the text. Expands the canvas to avoid clipping
// and fills the new corners white so OCR sees clean margins.
export function deskew(src, angleDeg) {
  const rad = (-angleDeg * Math.PI) / 180;
  const w = src.width;
  const h = src.height;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const nw = Math.ceil(w * cos + h * sin);
  const nh = Math.ceil(w * sin + h * cos);
  const out = createCanvas(nw, nh);
  const c = out.getContext('2d');
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, nw, nh);
  c.translate(nw / 2, nh / 2);
  c.rotate(rad);
  c.drawImage(src, -w / 2, -h / 2);
  return out;
}

/** Skew angle of a canvas, measured on its binarized pixels. */
export function skewOf(canvas) {
  try {
    const d = ctx2d(canvas).getImageData(0, 0, canvas.width, canvas.height).data;
    return estimateSkew(d, canvas.width, canvas.height);
  } catch { return 0; }
}

/** True when the text energy says this canvas was shot sideways. */
export function looksSideways(canvas) {
  try {
    const d = ctx2d(canvas).getImageData(0, 0, canvas.width, canvas.height).data;
    globalThreshold(d, canvas.width, canvas.height);
    const { varH, varV } = projectionVariances(d, canvas.width, canvas.height);
    return varV > varH * 1.15;
  } catch { return false; }
}
