// Pure geometry for the perspective (unwarp) path: find the sheet of paper as
// a quadrilateral, decide whether it is skewed enough to be worth flattening,
// and solve/apply the projective transform that flattens it.
//
// Nothing here touches a canvas. Everything takes plain buffers and plain
// points, which is what makes it independently testable — see
// src/utils/ocrGeometry.test.js.

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Largest connected run of bright (paper) pixels, returned as a labelled map.
// Isolating one component matters: a bright plate or napkin elsewhere in frame
// would otherwise drag the corners out with it.
export function largestBrightComponent(gray, w, h, t) {
  const n = w * h;
  const seen = new Uint8Array(n);
  const queue = new Int32Array(n);
  let bestCount = 0;
  let bestLabel = null;
  const comp = new Int32Array(n).fill(-1);
  let label = 0;

  for (let start = 0; start < n; start++) {
    if (seen[start] || gray[start] <= t) continue;
    let head = 0; let tail = 0; let count = 0;
    queue[tail++] = start; seen[start] = 1;
    while (head < tail) {
      const cur = queue[head++];
      comp[cur] = label; count++;
      const x = cur % w; const y = (cur / w) | 0;
      if (x > 0 && !seen[cur - 1] && gray[cur - 1] > t) { seen[cur - 1] = 1; queue[tail++] = cur - 1; }
      if (x < w - 1 && !seen[cur + 1] && gray[cur + 1] > t) { seen[cur + 1] = 1; queue[tail++] = cur + 1; }
      if (y > 0 && !seen[cur - w] && gray[cur - w] > t) { seen[cur - w] = 1; queue[tail++] = cur - w; }
      if (y < h - 1 && !seen[cur + w] && gray[cur + w] > t) { seen[cur + w] = 1; queue[tail++] = cur + w; }
    }
    if (count > bestCount) { bestCount = count; bestLabel = label; }
    label++;
  }
  if (bestLabel === null) return null;
  return { comp, label: bestLabel, count: bestCount };
}

// Corners of a convex-ish blob. For a quadrilateral, the extremes of (x+y) and
// (x-y) land on its four corners regardless of how it is rotated, which is far
// cheaper and steadier than hull-plus-line-fitting at this resolution.
export function quadFromComponent(comp, label, w, h) {
  let tl = null; let br = null; let tr = null; let bl = null;
  let minSum = Infinity; let maxSum = -Infinity;
  let minDiff = Infinity; let maxDiff = -Infinity;
  for (let y = 0; y < h; y++) {
    const yo = y * w;
    for (let x = 0; x < w; x++) {
      if (comp[yo + x] !== label) continue;
      const sum = x + y; const diff = x - y;
      if (sum < minSum) { minSum = sum; tl = { x, y }; }
      if (sum > maxSum) { maxSum = sum; br = { x, y }; }
      if (diff > maxDiff) { maxDiff = diff; tr = { x, y }; }
      if (diff < minDiff) { minDiff = diff; bl = { x, y }; }
    }
  }
  if (!tl || !tr || !br || !bl) return null;
  return { tl, tr, br, bl };
}

// Worth unwarping only when the shape really is a trapezoid. Resampling costs
// a little sharpness, so a receipt that is already square-on is left alone.
export function perspectiveStrength(q) {
  const top = dist(q.tl, q.tr);
  const bottom = dist(q.bl, q.br);
  const left = dist(q.tl, q.bl);
  const right = dist(q.tr, q.br);
  const wSkew = Math.abs(top - bottom) / Math.max(1, Math.max(top, bottom));
  const hSkew = Math.abs(left - right) / Math.max(1, Math.max(left, right));
  return Math.max(wSkew, hSkew);
}

// A quad whose corners collapse onto each other, or whose sides are wildly
// unequal, is not a receipt — it is a blob that happened to be bright. Without
// this guard the unwarp happily stretches a coffee cup across the full frame
// and the pass that was meant to rescue an angled shot destroys a fine one.
export function quadIsPlausible(q, w, h) {
  const top = dist(q.tl, q.tr);
  const bottom = dist(q.bl, q.br);
  const left = dist(q.tl, q.bl);
  const right = dist(q.tr, q.br);
  const minSide = Math.min(top, bottom, left, right);
  if (minSide < Math.min(w, h) * 0.1) return false;
  // Opposite sides of a photographed rectangle differ by perspective, but not
  // by more than about 2x unless the corner detection went wrong.
  if (Math.max(top, bottom) / Math.max(1, Math.min(top, bottom)) > 2.2) return false;
  if (Math.max(left, right) / Math.max(1, Math.min(left, right)) > 2.2) return false;
  return true;
}

// Solve the 8 unknowns of a projective transform mapping src -> dst (h33 = 1)
// by Gaussian elimination with partial pivoting.
export function solveHomography(src, dst) {
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const m = 8;
  for (let col = 0; col < m; col++) {
    let piv = col;
    for (let r = col + 1; r < m; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    if (Math.abs(A[piv][col]) < 1e-9) return null;
    [A[col], A[piv]] = [A[piv], A[col]];
    [b[col], b[piv]] = [b[piv], b[col]];
    for (let r = 0; r < m; r++) {
      if (r === col) continue;
      const f = A[r][col] / A[col][col];
      if (!f) continue;
      for (let c = col; c < m; c++) A[r][c] -= f * A[col][c];
      b[r] -= f * b[col];
    }
  }
  const hh = new Float64Array(9);
  for (let i = 0; i < m; i++) hh[i] = b[i] / A[i][i];
  hh[8] = 1;
  return hh;
}

/** Apply a 3x3 homography to a point. */
export function applyHomography(hh, x, y) {
  const den = hh[6] * x + hh[7] * y + hh[8];
  return { x: (hh[0] * x + hh[1] * y + hh[2]) / den, y: (hh[3] * x + hh[4] * y + hh[5]) / den };
}

// Resample src RGBA (sw x sh) through the quad onto an outW x outH RGBA buffer,
// bilinearly. The inverse transform is solved directly (dst -> src) so every
// destination pixel is filled exactly once and no seams appear.
export function unwarpPixels(sd, sw, sh, quad, outW, outH) {
  const inv = solveHomography(
    [{ x: 0, y: 0 }, { x: outW - 1, y: 0 }, { x: outW - 1, y: outH - 1 }, { x: 0, y: outH - 1 }],
    [quad.tl, quad.tr, quad.br, quad.bl],
  );
  if (!inv) return null;
  const o = new Uint8ClampedArray(outW * outH * 4);
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const den = inv[6] * x + inv[7] * y + inv[8];
      const sx = (inv[0] * x + inv[1] * y + inv[2]) / den;
      const sy = (inv[3] * x + inv[4] * y + inv[5]) / den;
      const di = (y * outW + x) * 4;
      if (sx < 0 || sy < 0 || sx > sw - 1 || sy > sh - 1) {
        o[di] = o[di + 1] = o[di + 2] = 255; o[di + 3] = 255;
        continue;
      }
      const x0 = sx | 0; const y0 = sy | 0;
      const x1 = Math.min(sw - 1, x0 + 1); const y1 = Math.min(sh - 1, y0 + 1);
      const fx = sx - x0; const fy = sy - y0;
      for (let c = 0; c < 3; c++) {
        const p00 = sd[(y0 * sw + x0) * 4 + c];
        const p10 = sd[(y0 * sw + x1) * 4 + c];
        const p01 = sd[(y1 * sw + x0) * 4 + c];
        const p11 = sd[(y1 * sw + x1) * 4 + c];
        o[di + c] = (p00 * (1 - fx) + p10 * fx) * (1 - fy) + (p01 * (1 - fx) + p11 * fx) * fy;
      }
      o[di + 3] = 255;
    }
  }
  return o;
}

// Grow outward from the densest row/column while coverage stays high. Taking a
// plain min/max bounding box would let one bright speck in a corner drag the
// crop back out to the whole frame; requiring sustained coverage keeps the box
// on the paper itself.
export function denseBand(profile, len, peakFrac = 0.45) {
  let peak = 0; let peakAt = 0;
  for (let i = 0; i < len; i++) if (profile[i] > peak) { peak = profile[i]; peakAt = i; }
  if (peak <= 0) return null;
  const floor = peak * peakFrac;
  let a = peakAt; while (a > 0 && profile[a - 1] >= floor) a--;
  let b = peakAt; while (b < len - 1 && profile[b + 1] >= floor) b++;
  return [a, b];
}

// Horizontal vs. vertical text energy, from a downscaled binary sample. Text
// lines make the projection perpendicular to them spiky, so an upright receipt
// has a spiky row profile and a smooth column profile.
//
// The two profiles must be compared scale-free. Raw variance is not: the row
// and column profiles are sampled on different axes, so on a tall receipt the
// column counts range far higher than the row counts and win on magnitude
// alone. The coefficient of variation removes that bias.
export function projectionVariances(data, w, h) {
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

// Estimate the skew angle (degrees) via projection-profile variance: the angle
// at which black (text) pixels collapse into the sharpest horizontal bands is
// the angle the receipt is tilted. Runs on a downscaled sample for speed.
export function estimateSkew(data, w, h) {
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
