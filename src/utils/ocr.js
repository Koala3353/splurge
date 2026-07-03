// Browser-only OCR helper: one reused Tesseract worker (fast repeat scans) and
// document-grade image preprocessing (adaptive threshold + auto-orient +
// deskew) tuned for phone photos of thermal receipts.

import { rateReceiptText } from './receipt';

let workerPromise = null;
let progressCb = null;

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
      // PSM 4 = single column of variable-size lines (a receipt).
      await worker.setParameters({ tessedit_pageseg_mode: '4', preserve_interword_spaces: '1' });
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
    //  3. thresholded variant over raw — cleaner when both are equal
    //  4. word count — only as a final tie-break (never lets noise outvote)
    const keyOf = (rate, variant, words) => [
      2 * (rate.money + rate.fees),
      Math.min(rate.bare, 1),
      variant === 'thresh' ? 1 : 0,
      words,
    ];
    const gt = (a, b) => {
      for (let k = 0; k < a.length; k++) {
        if (a[k] !== b[k]) return a[k] > b[k];
      }
      return false;
    };

    let best = { text: '', key: [-1, 0, 0, 0] };
    for (let i = 0; i < candidates.length; i++) {
      onProgress?.(i === 0 ? 'Reading the receipt…' : 'Trying another read…');
      let canvas;
      try { canvas = candidates[i].run(); } catch { continue; }
      const { data } = await worker.recognize(canvas);
      const rate = rateReceiptText(data.text);
      const words = data.text.split(/\s+/).filter(Boolean).length;
      const key = keyOf(rate, candidates[i].variant, words);
      if (gt(key, best.key)) best = { text: data.text, key };
      if (best.key[0] >= 4) break;            // ≥2 strong signals — done
      if (best.key[0] >= 2 && i >= 1) break;  // 1 strong signal + both variants tried
    }
    return best.text;
  } finally {
    progressCb = null;
  }
}

// --- Preprocessing --------------------------------------------------------

// Load + resize the photo, returning BOTH preprocessing variants: an
// adaptively-binarized canvas (rescues dark/low-contrast surfaces) and the
// plain resized photo (rescues washed-out prints that binarization erases).
// Neither wins universally, so scanReceipt races both and keeps the best.
async function preprocessBase(file) {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.src = url;
  try {
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });
    const TARGET = 1600; // longest side: legible text vs. mobile memory/speed
    let { width, height } = img;
    const scale = TARGET / Math.max(width, height);
    if (scale < 0.95 || scale > 1.1) {
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
    }
    const raw = document.createElement('canvas');
    raw.width = width;
    raw.height = height;
    raw.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0, width, height);

    const thresh = document.createElement('canvas');
    thresh.width = width;
    thresh.height = height;
    const tctx = thresh.getContext('2d', { willReadFrequently: true });
    tctx.drawImage(img, 0, 0, width, height);
    try {
      const imageData = tctx.getImageData(0, 0, width, height);
      adaptiveThreshold(imageData.data, width, height);
      tctx.putImageData(imageData, 0, 0);
    } catch { /* tainted canvas — leave the plain draw */ }
    return { raw, thresh };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Decide a likely orientation order, then return lazy thunks over BOTH
// preprocessing variants per orientation (thresholded first — it wins more
// often — then raw). Receipts are tall: if the text runs vertically
// (sideways photo) we try the 90° rotations first; otherwise upright first.
async function buildCandidates(file) {
  const { raw, thresh } = await preprocessBase(file);
  let vertical = false;
  try {
    const d = thresh.getContext('2d').getImageData(0, 0, thresh.width, thresh.height).data;
    const { varH, varV } = projectionVariances(d, thresh.width, thresh.height);
    vertical = varV > varH * 1.15;
  } catch { /* ignore */ }

  // The skew angle is estimated on the binarized rotation (the estimator
  // needs clean black-on-white) and applied to whichever variant is OCRed.
  const rotCache = {};
  const rotated = (deg, base) => (deg === 0 ? base : rotate90(base, deg));
  const mk = (deg, variant) => () => {
    if (!(deg in rotCache)) {
      const t = rotated(deg, thresh);
      let angle = 0;
      try {
        const d = t.getContext('2d').getImageData(0, 0, t.width, t.height).data;
        angle = estimateSkew(d, t.width, t.height);
      } catch { /* ignore */ }
      rotCache[deg] = { t, angle };
    }
    const { t, angle } = rotCache[deg];
    const canvas = variant === 'thresh' ? t : rotated(deg, raw);
    return Math.abs(angle) >= 1 ? deskew(canvas, angle) : canvas;
  };

  const order = vertical ? [90, -90, 0] : [0, 90, -90];
  const out = [];
  for (const deg of order) {
    out.push({ run: mk(deg, 'thresh'), variant: 'thresh' });
    out.push({ run: mk(deg, 'raw'), variant: 'raw' });
  }
  return out;
}

// Horizontal vs. vertical text energy, from a downscaled binary sample. Text
// lines make the projection perpendicular to them spiky (high variance).
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
  const variance = (arr) => {
    let m = 0; for (let i = 0; i < arr.length; i++) m += arr[i]; m /= arr.length;
    let s2 = 0; for (let i = 0; i < arr.length; i++) { const dd = arr[i] - m; s2 += dd * dd; }
    return s2 / arr.length;
  };
  return { varH: variance(rows), varV: variance(cols) };
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
      const v = gray[idx] < mean - C ? 0 : 255;
      const p = idx * 4;
      d[p] = d[p + 1] = d[p + 2] = v;
    }
  }
}
