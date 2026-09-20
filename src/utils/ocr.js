// Browser-only OCR helper: one reused Tesseract worker (fast repeat scans) and
// document-grade image preprocessing (adaptive threshold + auto-orient +
// deskew) tuned for phone photos of thermal receipts.

import { rateReceiptText } from './receipt';

let workerPromise = null;
let progressCb = null;

// Page-segmentation modes. PSM 4 ("single column of variable-size lines")
// sounds like the right description of a receipt, but it silently drops the
// right-hand price column whenever the gap between item name and amount is
// wide — which is how most receipts are printed. PSM 6 treats the receipt as
// one uniform block and keeps both columns on the same line, which is what the
// parser needs in order to pair a name with its amount.
const PSM_BLOCK = '6';
const PSM_COLUMN = '4';

// Lazily create — and reuse — a single configured worker. Calling this early
// (e.g. when the user taps "Scan") warms the engine while they pick a photo.
export function warmUpOcr() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng', 1, {
        logger: (m) => {
          if (!progressCb) return;
          if (m.status === 'recognizing text') progressCb(`Reading text… ${Math.round(m.progress * 100)}%`);
          else if (/load|traineddata|initial/i.test(m.status)) progressCb('Warming up the scanner (one-time)…');
        },
      });
      await worker.setParameters({ preserve_interword_spaces: '1' });
      return worker;
    })().catch((err) => { workerPromise = null; throw err; });
  }
  return workerPromise;
}

export async function scanReceipt(file, onProgress) {
  progressCb = onProgress || null;
  try {
    onProgress?.('Optimizing image…');
    const candidates = await buildCandidates(file); // lazy thunks, best-first
    const worker = await warmUpOcr();

    // Race key, most important first:
    //  1. money items + fee lines (×2) — strong evidence of a real read
    //  2. bare-integer items, CAPPED at 1 — name+integer garbage is exactly
    //     what busy backgrounds hallucinate, so more of them isn't better
    //  3. engine confidence, bucketed — a finer signal than word count, but
    //     coarse enough that a 2-point wobble can't outrank real evidence
    //  4. word count — only as a final tie-break (never lets noise outvote)
    const keyOf = (rate, confidence, words) => [
      2 * (rate.money + rate.fees),
      Math.min(rate.bare, 1),
      Math.round(confidence / 10),
      words,
    ];
    const gt = (a, b) => {
      for (let k = 0; k < a.length; k++) {
        if (a[k] !== b[k]) return a[k] > b[k];
      }
      return false;
    };

    let appliedPsm = null;
    let best = { text: '', key: [-1, 0, 0, 0], diagnostics: null };
    let attempts = 0;

    for (let i = 0; i < candidates.length; i++) {
      onProgress?.(i === 0 ? 'Reading the receipt…' : 'Trying another read…');
      const cand = candidates[i];
      let canvas;
      try { canvas = cand.run(); } catch { continue; }
      if (cand.psm !== appliedPsm) {
        await worker.setParameters({ tessedit_pageseg_mode: cand.psm });
        appliedPsm = cand.psm;
      }
      const { data } = await worker.recognize(canvas);
      attempts += 1;
      const rate = rateReceiptText(data.text);
      const words = data.text.split(/\s+/).filter(Boolean).length;
      const confidence = Number.isFinite(data.confidence) ? data.confidence : 0;
      const key = keyOf(rate, confidence, words);
      if (gt(key, best.key)) {
        best = {
          text: data.text,
          key,
          diagnostics: {
            variant: cand.variant,
            orientation: cand.deg,
            cropped: cand.cropped,
            psm: cand.psm,
            confidence: Math.round(confidence),
            width: canvas.width,
            height: canvas.height,
            preview: thumbnail(canvas),
          },
        };
      }
      if (best.key[0] >= 4) break;            // ≥2 strong signals — done
      if (best.key[0] >= 2 && i >= 1) break;  // 1 strong signal + both variants tried
    }

    return {
      text: best.text,
      diagnostics: { ...(best.diagnostics || {}), attempts, tried: candidates.length },
    };
  } finally {
    progressCb = null;
  }
}

// A small JPEG of exactly what the engine saw. This is the fastest way to
// tell a bad crop from a threshold that erased faint print — both look
// identical in the item list, and completely different here.
function thumbnail(canvas, maxW = 260) {
  try {
    const scale = Math.min(1, maxW / canvas.width);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(canvas.width * scale));
    c.height = Math.max(1, Math.round(canvas.height * scale));
    c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.6);
  } catch { return null; }
}

// --- Preprocessing --------------------------------------------------------

const TARGET_SHORT = 1100;   // receipt width in px; keeps thermal glyphs ~35px
const MAX_PIXELS = 4.2e6;    // ImageData ceiling, so mid-range phones survive

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

// Render a region of the original photo at a text-legible size. Scaling by the
// SHORT side matters: driving the longest side (as this once did) leaves a long
// receipt about 400px wide, putting thermal print near 14px cap height — below
// what Tesseract reads reliably — while a short receipt comes out fine. That
// asymmetry is exactly why scans used to work "sometimes".
function renderRegion(img, box) {
  const b = box || { x: 0, y: 0, w: img.width, h: img.height };
  let scale = TARGET_SHORT / Math.max(1, Math.min(b.w, b.h));
  scale = Math.min(scale, 1.6);                       // upscaling invents no detail
  if (b.w * b.h * scale * scale > MAX_PIXELS) scale = Math.sqrt(MAX_PIXELS / (b.w * b.h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(b.w * scale));
  c.height = Math.max(1, Math.round(b.h * scale));
  const ctx = c.getContext('2d', { willReadFrequently: true });
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
function applyVariant(canvas, variant) {
  if (variant === 'original') return canvas;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  try {
    const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
    if (variant === 'threshold') adaptiveThreshold(id.data, canvas.width, canvas.height);
    else contrastStretch(id.data, canvas.width, canvas.height);
    ctx.putImageData(id, 0, 0);
  } catch { /* tainted canvas — leave the plain draw */ }
  return canvas;
}

// Grayscale + percentile contrast stretch. Thermal print is often faint gray on
// off-white rather than black on white; clipping to the 2nd/98th percentile
// pulls those strokes apart without the all-or-nothing decision binarization
// makes, so half-formed characters survive to the recogniser.
function contrastStretch(d, w, h) {
  const n = w * h;
  const gray = new Uint8ClampedArray(n);
  const hist = new Uint32Array(256);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const g = (0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2]) | 0;
    gray[i] = g; hist[g]++;
  }
  let acc = 0; let lo = 0; let hi = 255;
  const loCut = n * 0.02; const hiCut = n * 0.98;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= loCut) { lo = v; break; } }
  acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= hiCut) { hi = v; break; } }
  const range = Math.max(1, hi - lo);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    let v = ((gray[i] - lo) / range) * 255;
    v = v < 0 ? 0 : v > 255 ? 255 : v;
    d[p] = d[p + 1] = d[p + 2] = v;
  }
}

// Locate the receipt by finding the paper, not the ink. An earlier version
// profiled dark pixels, which fails on exactly the surfaces that need it most:
// wood grain, tiles or a patterned tablecloth scatter "ink" across the whole
// frame, the bounding box grows to fill it, and the crop is discarded. Paper is
// the more reliable signal — a receipt is a large, bright, contiguous block,
// and Otsu picks the paper/table split without a hand-tuned constant.
function otsuThreshold(hist, total) {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0; let wB = 0; let best = 128; let bestVar = -1;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const v = wB * wF * (mB - mF) * (mB - mF);
    if (v > bestVar) { bestVar = v; best = t; }
  }
  return best;
}

// Grow outward from the densest row/column while coverage stays high. Taking a
// plain min/max bounding box would let one bright speck in a corner drag the
// crop back out to the whole frame; requiring sustained coverage keeps the box
// on the paper itself.
function denseBand(profile, len, peakFrac = 0.45) {
  let peak = 0; let peakAt = 0;
  for (let i = 0; i < len; i++) if (profile[i] > peak) { peak = profile[i]; peakAt = i; }
  if (peak <= 0) return null;
  const floor = peak * peakFrac;
  let a = peakAt; while (a > 0 && profile[a - 1] >= floor) a--;
  let b = peakAt; while (b < len - 1 && profile[b + 1] >= floor) b++;
  return [a, b];
}

function detectCrop(img) {
  const ANALYSIS = 1000;
  const scale = Math.min(1, ANALYSIS / Math.max(img.width, img.height));
  const aw = Math.max(1, Math.round(img.width * scale));
  const ah = Math.max(1, Math.round(img.height * scale));
  const probe = document.createElement('canvas');
  probe.width = aw; probe.height = ah;
  const ctx = probe.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, aw, ah);
  try {
    const d = ctx.getImageData(0, 0, aw, ah).data;
    const n = aw * ah;
    const gray = new Uint8ClampedArray(n);
    const hist = new Uint32Array(256);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const g = (0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2]) | 0;
      gray[i] = g; hist[g]++;
    }
    const t = otsuThreshold(hist, n);
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

// Lazy, best-first list of everything worth trying. Ordering matters far more
// than breadth: the early exit in scanReceipt usually stops after one or two
// passes, so the combinations most likely to succeed go first and the
// expensive long tail only runs when the receipt is genuinely hard.
async function buildCandidates(file) {
  const img = await loadImage(file);
  const crop = detectCrop(img);

  const renders = new Map();                       // "cropped|variant" -> canvas
  const baseOf = (cropped, variant) => {
    const k = `${cropped}|${variant}`;
    if (!renders.has(k)) {
      renders.set(k, applyVariant(renderRegion(img, cropped ? crop : null), variant));
    }
    return renders.get(k);
  };

  // Orientation: receipts are tall, so if the text energy runs vertically the
  // photo was taken sideways and the 90° rotations go first.
  // Orientation. The paper's own shape is the strongest signal available and
  // it is already measured: receipts are printed on a tall narrow roll, so a
  // detected region that is wider than it is tall means the photo was taken
  // sideways. Pixel-statistics probes were tried first and proved unreliable —
  // adaptive binarization speckles blank paper, and a global threshold turns
  // the shadowed edge of an unevenly-lit receipt into a solid block, and either
  // one flattens the line structure the measurement depends on.
  let vertical = false;
  if (crop && Math.max(crop.w, crop.h) / Math.min(crop.w, crop.h) > 1.2) {
    vertical = crop.w > crop.h;
  } else {
    // No decisive crop (square-ish receipt, or paper filling the frame): fall
    // back to text-energy profiles, which are at least unbiased here.
    try {
      const t = baseOf(!!crop, 'original');
      const d = t.getContext('2d').getImageData(0, 0, t.width, t.height).data;
      globalThreshold(d, t.width, t.height);
      const { varH, varV } = projectionVariances(d, t.width, t.height);
      vertical = varV > varH * 1.15;
    } catch { /* leave upright */ }
  }

  const skewCache = new Map();
  const make = (cropped, variant, deg, psm) => ({
    variant, deg, psm, cropped,
    run: () => {
      const base = baseOf(cropped, variant);
      const rotated = deg === 0 ? base : rotate90(base, deg);
      const k = `${cropped}|${deg}`;
      if (!skewCache.has(k)) {
        let angle = 0;
        try {
          const ref = deg === 0 ? baseOf(cropped, 'threshold')
            : rotate90(baseOf(cropped, 'threshold'), deg);
          const d = ref.getContext('2d').getImageData(0, 0, ref.width, ref.height).data;
          angle = estimateSkew(d, ref.width, ref.height);
        } catch { /* ignore */ }
        skewCache.set(k, angle);
      }
      const angle = skewCache.get(k);
      return Math.abs(angle) >= 1 ? deskew(rotated, angle) : rotated;
    },
  });

  const primary = vertical ? 90 : 0;
  const others = vertical ? [-90, 0] : [90, -90];
  const C = !!crop;
  const out = [make(C, 'threshold', primary, PSM_BLOCK)];
  // A sideways photo is 90° or -90° and the paper's shape cannot say which, so
  // resolve the flip immediately rather than after three variants of the wrong
  // rotation — it is the difference between two passes and five.
  if (vertical) out.push(make(C, 'threshold', -90, PSM_BLOCK));
  out.push(make(C, 'contrast', primary, PSM_BLOCK));
  out.push(make(C, 'original', primary, PSM_BLOCK));
  // If a crop was taken, give the untouched frame a shot before spending
  // passes on rotations — a wrong crop is the failure this recovers from.
  if (C) out.push(make(false, 'threshold', primary, PSM_BLOCK));
  for (const deg of others) {
    if (vertical && deg === -90) continue;   // already tried above
    out.push(make(C, 'threshold', deg, PSM_BLOCK));
    out.push(make(C, 'contrast', deg, PSM_BLOCK));
  }
  // Column mode lost to block mode on every layout measured, but it stays as a
  // final fallback for a read that produced nothing at all.
  out.push(make(C, 'threshold', primary, PSM_COLUMN));
  return out;
}

// Horizontal vs. vertical text energy, from a downscaled binary sample. Text
// lines make the projection perpendicular to them spiky, so an upright receipt
// has a spiky row profile and a smooth column profile.
//
// The two profiles must be compared scale-free. Raw variance is not: the row
// and column profiles are sampled on different axes, so on a tall receipt the
// column counts range far higher than the row counts and win on magnitude
// alone. That made every tall receipt — which is to say every receipt — look
// like it had been photographed sideways, so the engine spent its first passes
// on wrong rotations and only reached the correct one last. The coefficient of
// variation (spread relative to the mean) removes that bias.
function projectionVariances(data, w, h) {
  const SW = Math.min(200, w);
  const s = SW / w;
  const SH = Math.max(1, Math.round(h * s));
  const rows = new Float64Array(SH);
  const cols = new Float64Array(SW);
  let total = 0;
  for (let sy = 0; sy < SH; sy++) {
    const y = Math.min(h - 1, Math.round(sy / s));
    for (let sx = 0; sx < SW; sx++) {
      const x = Math.min(w - 1, Math.round(sx / s));
      if (data[(y * w + x) * 4] < 128) { rows[sy]++; cols[sx]++; total++; }
    }
  }
  if (total < 50) return { varH: 0, varV: 0 };
  const cv = (arr) => {
    let m = 0;
    for (let i = 0; i < arr.length; i++) m += arr[i];
    m /= arr.length;
    if (m <= 0) return 0;
    let s2 = 0;
    for (let i = 0; i < arr.length; i++) { const dd = arr[i] - m; s2 += dd * dd; }
    return Math.sqrt(s2 / arr.length) / m;
  };
  return { varH: cv(rows), varV: cv(cols) };
}

// Global Otsu binarization on a copy of the pixels. Used for structural
// measurements (orientation, skew) where clean line separation matters more
// than rescuing every faint stroke.
function globalThreshold(d, w, h) {
  const n = w * h;
  const gray = new Uint8ClampedArray(n);
  const hist = new Uint32Array(256);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const g = (0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2]) | 0;
    gray[i] = g; hist[g]++;
  }
  const t = otsuThreshold(hist, n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const v = gray[i] < t ? 0 : 255;
    d[p] = d[p + 1] = d[p + 2] = v;
  }
}

// Rotate a canvas by ±90° (dir > 0 = clockwise). Dimensions swap.
function rotate90(src, dir) {
  const w = src.width;
  const h = src.height;
  const out = document.createElement('canvas');
  out.width = h;
  out.height = w;
  const c = out.getContext('2d');
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, out.width, out.height);
  c.translate(h / 2, w / 2);
  c.rotate((dir >= 0 ? 1 : -1) * Math.PI / 2);
  c.drawImage(src, -w / 2, -h / 2);
  return out;
}

// Estimate the skew angle (degrees) via projection-profile variance: the angle
// at which black (text) pixels collapse into the sharpest horizontal bands is
// the angle the receipt is tilted. Runs on a downscaled sample for speed.
function estimateSkew(data, w, h) {
  const SW = Math.min(260, w);
  const s = SW / w;
  const SH = Math.max(1, Math.round(h * s));
  const xs = [];
  const ys = [];
  for (let sy = 0; sy < SH; sy++) {
    const y = Math.min(h - 1, Math.round(sy / s));
    for (let sx = 0; sx < SW; sx++) {
      const x = Math.min(w - 1, Math.round(sx / s));
      if (data[(y * w + x) * 4] < 128) { xs.push(sx); ys.push(sy); }
    }
  }
  if (xs.length < 80) return 0;

  const off = SW;
  const binLen = SH + 2 * SW;
  const score = (deg) => {
    const t = Math.tan((deg * Math.PI) / 180);
    const bins = new Float64Array(binLen);
    for (let i = 0; i < xs.length; i++) {
      const r = Math.round(ys[i] - xs[i] * t) + off;
      if (r >= 0 && r < binLen) bins[r]++;
    }
    let acc = 0;
    for (let i = 0; i < binLen; i++) acc += bins[i] * bins[i];
    return acc;
  };

  let best = 0;
  let bestScore = -1;
  for (let deg = -12; deg <= 12; deg += 1) {
    const sc = score(deg);
    if (sc > bestScore) { bestScore = sc; best = deg; }
  }
  for (let deg = best - 1; deg <= best + 1; deg += 0.25) {
    const sc = score(deg);
    if (sc > bestScore) { bestScore = sc; best = deg; }
  }
  return best;
}

// Rotate the canvas to level the text. Expands the canvas to avoid clipping
// and fills the new corners white so OCR sees clean margins.
function deskew(src, angleDeg) {
  const rad = (-angleDeg * Math.PI) / 180;
  const w = src.width;
  const h = src.height;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const nw = Math.ceil(w * cos + h * sin);
  const nh = Math.ceil(w * sin + h * cos);
  const out = document.createElement('canvas');
  out.width = nw;
  out.height = nh;
  const c = out.getContext('2d');
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, nw, nh);
  c.translate(nw / 2, nh / 2);
  c.rotate(rad);
  c.drawImage(src, -w / 2, -h / 2);
  return out;
}

// Adaptive (local-mean) thresholding via an integral image. Converts the photo
// to crisp black text on white, correcting for shadows, folds, uneven lighting
// and dark backgrounds far better than a global contrast stretch. O(pixels).
function adaptiveThreshold(d, w, h) {
  const n = w * h;
  const gray = new Float64Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    gray[i] = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
  }

  const iw = w + 1;
  const integral = new Float64Array(iw * (h + 1));
  for (let y = 1; y <= h; y++) {
    let rowSum = 0;
    const yo = y * iw;
    const yp = (y - 1) * iw;
    for (let x = 1; x <= w; x++) {
      rowSum += gray[(y - 1) * w + (x - 1)];
      integral[yo + x] = integral[yp + x] + rowSum;
    }
  }

  // Window ~1/18 of the smaller side (odd); C biases toward keeping faint text.
  const win = (Math.max(15, Math.round(Math.min(w, h) / 18)) | 1);
  const half = win >> 1;
  const C = 8;

  // Global paper/ink split, used only as a ceiling so texture on bright paper
  // cannot become ink. Generous headroom above it keeps faint thermal strokes.
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) hist[gray[i] | 0]++;
  const inkCeiling = otsuThreshold(hist, n) + 40;

  for (let y = 0; y < h; y++) {
    const y0 = y - half < 0 ? 0 : y - half;
    const y1 = y + half >= h ? h - 1 : y + half;
    for (let x = 0; x < w; x++) {
      const x0 = x - half < 0 ? 0 : x - half;
      const x1 = x + half >= w ? w - 1 : x + half;
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum = integral[(y1 + 1) * iw + (x1 + 1)]
        - integral[y0 * iw + (x1 + 1)]
        - integral[(y1 + 1) * iw + x0]
        + integral[y0 * iw + x0];
      const mean = sum / area;
      const idx = y * w + x;
      const g = gray[idx];
      // Local test finds strokes under uneven lighting; the global test stops
      // faint paper texture from being promoted to ink, which used to speckle
      // every blank region and bury the receipt's line structure in noise.
      const v = (g < mean - C && g < inkCeiling) ? 0 : 255;
      const p = idx * 4;
      d[p] = d[p + 1] = d[p + 2] = v;
    }
  }
}
