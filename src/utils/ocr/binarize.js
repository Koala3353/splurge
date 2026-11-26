// Pixel-level thresholding and contrast passes. Pure functions over RGBA /
// grayscale buffers — no canvas, no DOM, so they are directly unit-testable.

/** Otsu's between-class-variance threshold for a 256-bin histogram. */
export function otsuThreshold(hist, total) {
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

// Divide out the lighting.
//
// The per-pixel passes below are local and cope with a shadow on their own,
// but three structural steps are not: the crop, the paper-quad detection and
// the sideways probe all run a GLOBAL Otsu split to tell paper from table.
// Put half the receipt in shade and that split lands between the lit half and
// the shaded half rather than between paper and table — the crop keeps only
// the bright part of the receipt, and the quad is built from the wrong
// corners. Dividing the image by a heavily blurred copy of itself removes the
// low-frequency lighting and leaves reflectance, which is what "is this
// paper?" is actually asking.
//
// The blur is a box blur over an integral image, so this is O(pixels) and runs
// on the ~1000px analysis probe, not the full photo.
export function flattenIllumination(gray, w, h, { windowDivisor = 4, target = 160 } = {}) {
  const n = w * h;
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
  // A window this wide cannot follow a glyph, only the lighting across the
  // frame — which is the whole point. Too small and it erases the ink too.
  const half = Math.max(8, Math.round(Math.min(w, h) / windowDivisor)) >> 1;
  const out = new Uint8ClampedArray(n);
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
      const local = sum / area;
      const idx = y * w + x;
      out[idx] = local > 1 ? (gray[idx] / local) * target : gray[idx];
    }
  }
  return out;
}

/** 256-bin histogram of an already-grayscale buffer. */
export function histogramOf(gray) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i] | 0]++;
  return hist;
}

/** Luma + histogram of an RGBA buffer, computed once and shared. */
export function grayscale(d, w, h) {
  const n = w * h;
  const gray = new Uint8ClampedArray(n);
  const hist = new Uint32Array(256);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const g = (0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2]) | 0;
    gray[i] = g; hist[g]++;
  }
  return { gray, hist, n };
}

// Grayscale + percentile contrast stretch. Thermal print is often faint gray on
// off-white rather than black on white; clipping to the 2nd/98th percentile
// pulls those strokes apart without the all-or-nothing decision binarization
// makes, so half-formed characters survive to the recogniser.
export function contrastStretch(d, w, h) {
  const { gray, hist, n } = grayscale(d, w, h);
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

// Global Otsu binarization in place. Used for structural measurements
// (orientation, skew) where clean line separation matters more than rescuing
// every faint stroke.
export function globalThreshold(d, w, h) {
  const { gray, hist, n } = grayscale(d, w, h);
  const t = otsuThreshold(hist, n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const v = gray[i] < t ? 0 : 255;
    d[p] = d[p + 1] = d[p + 2] = v;
  }
}

// Adaptive (local-mean) thresholding via an integral image. Converts the photo
// to crisp black text on white, correcting for shadows, folds, uneven lighting
// and dark backgrounds far better than a global contrast stretch. O(pixels).
//
// `windowDivisor` / `bias` are the two knobs that matter on real photos: a
// smaller window follows tighter shadows but starts carving holes in bold
// glyphs, and a larger bias keeps faint strokes at the cost of paper texture.
export function adaptiveThreshold(d, w, h, { windowDivisor = 18, bias = 8, ceilingHeadroom = 40 } = {}) {
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

  const win = (Math.max(15, Math.round(Math.min(w, h) / windowDivisor)) | 1);
  const half = win >> 1;

  // Global paper/ink split, used only as a ceiling so texture on bright paper
  // cannot become ink. Generous headroom above it keeps faint thermal strokes.
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) hist[gray[i] | 0]++;
  const inkCeiling = otsuThreshold(hist, n) + ceilingHeadroom;

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
      const v = (g < mean - bias && g < inkCeiling) ? 0 : 255;
      const p = idx * 4;
      d[p] = d[p + 1] = d[p + 2] = v;
    }
  }
}
