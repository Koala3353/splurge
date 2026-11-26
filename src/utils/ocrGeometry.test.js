import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyHomography, denseBand, dist, estimateSkew, largestBrightComponent,
  perspectiveStrength, projectionVariances, quadFromComponent, quadIsPlausible,
  solveHomography, unwarpPixels,
} from './ocr/geometry.js';
import { adaptiveThreshold, grayscale, otsuThreshold } from './ocr/binarize.js';
import {
  CONFIDENCE_FAIR, CONFIDENCE_GOOD, confidenceBand, confidenceVerdict,
  sourceLabel, variantLabel,
} from './ocr/labels.js';

// --- helpers ---------------------------------------------------------------

// A w x h RGBA buffer, white by default. `paint(x, y) -> 0..255` sets gray.
function buffer(w, h, paint) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = paint ? paint(x, y) : 255;
      const p = (y * w + x) * 4;
      d[p] = d[p + 1] = d[p + 2] = v; d[p + 3] = 255;
    }
  }
  return d;
}

// --- homography ------------------------------------------------------------

test('solveHomography recovers an exact identity map', () => {
  const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 20 }, { x: 0, y: 20 }];
  const h = solveHomography(pts, pts);
  assert.ok(h);
  for (const p of pts) {
    const out = applyHomography(h, p.x, p.y);
    assert.ok(Math.abs(out.x - p.x) < 1e-6, `x ${out.x} != ${p.x}`);
    assert.ok(Math.abs(out.y - p.y) < 1e-6, `y ${out.y} != ${p.y}`);
  }
});

test('solveHomography maps each source corner onto its destination corner', () => {
  // A trapezoid — the receipt-photographed-at-an-angle case.
  const src = [{ x: 30, y: 10 }, { x: 90, y: 20 }, { x: 110, y: 90 }, { x: 10, y: 80 }];
  const dst = [{ x: 0, y: 0 }, { x: 99, y: 0 }, { x: 99, y: 199 }, { x: 0, y: 199 }];
  const h = solveHomography(src, dst);
  assert.ok(h);
  for (let i = 0; i < 4; i++) {
    const out = applyHomography(h, src[i].x, src[i].y);
    assert.ok(Math.abs(out.x - dst[i].x) < 1e-6);
    assert.ok(Math.abs(out.y - dst[i].y) < 1e-6);
  }
});

test('solveHomography returns null for a degenerate (collinear) quad', () => {
  const src = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }];
  const dst = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
  assert.equal(solveHomography(src, dst), null);
});

test('unwarpPixels straightens a trapezoid back into a rectangle', () => {
  // Black field with a white rectangle inset; sampling it through its own
  // corners must give back a (nearly) all-white output.
  const w = 60; const h = 60;
  const sd = buffer(w, h, (x, y) => (x >= 10 && x <= 49 && y >= 10 && y <= 49 ? 255 : 0));
  const quad = { tl: { x: 10, y: 10 }, tr: { x: 49, y: 10 }, br: { x: 49, y: 49 }, bl: { x: 10, y: 49 } };
  const out = unwarpPixels(sd, w, h, quad, 20, 20);
  assert.ok(out);
  let white = 0;
  for (let i = 0; i < 20 * 20; i++) if (out[i * 4] > 200) white++;
  assert.ok(white >= 20 * 20 - 4, `expected a white rectangle, got ${white}/400 white`);
});

test('unwarpPixels fills out-of-source destination pixels with white, not garbage', () => {
  const sd = buffer(10, 10, () => 0);
  // A quad that reaches past the right edge of the source.
  const quad = { tl: { x: 5, y: 0 }, tr: { x: 40, y: 0 }, br: { x: 40, y: 9 }, bl: { x: 5, y: 9 } };
  const out = unwarpPixels(sd, 10, 10, quad, 8, 4);
  assert.ok(out);
  let white = 0;
  for (let i = 0; i < 8 * 4; i++) if (out[i * 4] === 255 && out[i * 4 + 3] === 255) white++;
  assert.ok(white > 0, 'expected white padding outside the source');
});

// --- quad detection --------------------------------------------------------

test('largestBrightComponent ignores a smaller bright blob elsewhere in frame', () => {
  const w = 40; const h = 40;
  const gray = new Uint8ClampedArray(w * h);
  // Big sheet of "paper" on the left, a small bright "plate" top-right.
  for (let y = 5; y < 35; y++) for (let x = 2; x < 20; x++) gray[y * w + x] = 255;
  for (let y = 2; y < 6; y++) for (let x = 32; x < 38; x++) gray[y * w + x] = 255;
  const blob = largestBrightComponent(gray, w, h, 128);
  assert.ok(blob);
  assert.equal(blob.count, 30 * 18);
  const q = quadFromComponent(blob.comp, blob.label, w, h);
  assert.deepEqual(q.tl, { x: 2, y: 5 });
  assert.deepEqual(q.br, { x: 19, y: 34 });
});

test('quadFromComponent finds the corners of a rotated rectangle', () => {
  const w = 100; const h = 100;
  const comp = new Int32Array(w * h).fill(-1);
  // A genuinely rotated rectangle — the shape a receipt makes when the photo
  // is taken a little off-square.
  const corners = [{ x: 12, y: 24 }, { x: 70, y: 6 }, { x: 92, y: 68 }, { x: 34, y: 86 }];
  const inside = (x, y) => corners.every((p, i) => {
    const q = corners[(i + 1) % 4];
    return (q.x - p.x) * (y - p.y) - (q.y - p.y) * (x - p.x) >= 0;
  });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inside(x, y)) comp[y * w + x] = 7;
  const q = quadFromComponent(comp, 7, w, h);
  const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) <= 2;
  assert.ok(near(q.tl, corners[0]), `tl ${JSON.stringify(q.tl)}`);
  assert.ok(near(q.tr, corners[1]), `tr ${JSON.stringify(q.tr)}`);
  assert.ok(near(q.br, corners[2]), `br ${JSON.stringify(q.br)}`);
  assert.ok(near(q.bl, corners[3]), `bl ${JSON.stringify(q.bl)}`);
});

test('quadFromComponent returns null when the label is absent', () => {
  const comp = new Int32Array(16).fill(-1);
  assert.equal(quadFromComponent(comp, 3, 4, 4), null);
});

test('perspectiveStrength is ~0 for a square-on rectangle and large for a trapezoid', () => {
  const square = { tl: { x: 0, y: 0 }, tr: { x: 100, y: 0 }, br: { x: 100, y: 200 }, bl: { x: 0, y: 200 } };
  assert.ok(perspectiveStrength(square) < 1e-9);
  const angled = { tl: { x: 20, y: 0 }, tr: { x: 80, y: 0 }, br: { x: 100, y: 200 }, bl: { x: 0, y: 200 } };
  assert.ok(perspectiveStrength(angled) > 0.3, 'a clear trapezoid should read as strongly skewed');
});

test('quadIsPlausible rejects the blobs that used to get unwarped as receipts', () => {
  const w = 400; const h = 600;
  const good = { tl: { x: 40, y: 30 }, tr: { x: 330, y: 50 }, br: { x: 340, y: 540 }, bl: { x: 30, y: 560 } };
  assert.equal(quadIsPlausible(good, w, h), true);
  // Collapsed: three corners nearly coincide (a bright smear, not paper).
  const collapsed = { tl: { x: 10, y: 10 }, tr: { x: 12, y: 11 }, br: { x: 380, y: 580 }, bl: { x: 11, y: 13 } };
  assert.equal(quadIsPlausible(collapsed, w, h), false);
  // Wildly unequal opposite sides — corner detection went wrong.
  const lopsided = { tl: { x: 0, y: 0 }, tr: { x: 390, y: 0 }, br: { x: 100, y: 590 }, bl: { x: 0, y: 590 } };
  assert.equal(quadIsPlausible(lopsided, w, h), false);
});

test('dist is plain Euclidean distance', () => {
  assert.equal(dist({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
});

// --- bands, profiles, skew -------------------------------------------------

test('denseBand grows from the peak and stops at the coverage floor', () => {
  const p = [0, 0, 2, 9, 10, 9, 2, 0, 0];
  assert.deepEqual(denseBand(p, p.length, 0.45), [3, 5]);
  assert.equal(denseBand(new Float64Array(5), 5), null);
});

test('projectionVariances sees more spike in the axis perpendicular to the text', () => {
  // Horizontal "text lines": dark rows every 6px.
  const w = 120; const h = 120;
  const d = buffer(w, h, (x, y) => (y % 6 < 2 ? 0 : 255));
  const { varH, varV } = projectionVariances(d, w, h);
  assert.ok(varH > varV, `rows should be spikier: varH=${varH} varV=${varV}`);
});

test('estimateSkew measures a tilt it can see, and reports 0 on an empty page', () => {
  const w = 200; const h = 200;
  const deg = 5;
  const t = Math.tan((deg * Math.PI) / 180);
  // Lines tilted by +5 degrees.
  const d = buffer(w, h, (x, y) => (((y - x * t) % 10 + 10) % 10 < 2 ? 0 : 255));
  const angle = estimateSkew(d, w, h);
  assert.ok(Math.abs(angle - deg) <= 1.5, `expected ~${deg}, got ${angle}`);
  assert.equal(estimateSkew(buffer(50, 50), 50, 50), 0);
});

// --- thresholding ----------------------------------------------------------

test('otsuThreshold separates a bimodal ink/paper histogram', () => {
  const hist = new Uint32Array(256);
  let total = 0;
  // Ink around 40, paper around 210, each a small spread — the shape a real
  // receipt photo makes.
  for (let v = 30; v <= 50; v++) { hist[v] = 20; total += 20; }
  for (let v = 200; v <= 220; v++) { hist[v] = 60; total += 60; }
  // The returned value is the top of the ink class (the loop accumulates
  // hist[t] before scoring t), so it lands on the last ink bin, never inside
  // the paper mode.
  const t = otsuThreshold(hist, total);
  assert.ok(t >= 50 && t < 200, `threshold ${t} should sit between ink and paper`);
});

test('adaptiveThreshold keeps dark strokes and clears the paper under a gradient', () => {
  const w = 80; const h = 80;
  // Paper brightness ramps 120 -> 240 across the frame (a shadow); the strokes
  // are always 60 darker than their local background, so a GLOBAL threshold
  // cannot separate them but a local one must.
  const bg = (x) => 120 + Math.round((x / w) * 120);
  const isStroke = (x, y) => y % 8 < 2 && x > 5 && x < 74;
  const d = buffer(w, h, (x, y) => (isStroke(x, y) ? Math.max(0, bg(x) - 60) : bg(x)));
  adaptiveThreshold(d, w, h, { windowDivisor: 8, bias: 6 });
  let strokeDark = 0; let strokeTotal = 0; let paperWhite = 0; let paperTotal = 0;
  for (let y = 2; y < h - 2; y++) {
    for (let x = 10; x < 70; x++) {
      const v = d[(y * w + x) * 4];
      if (isStroke(x, y)) { strokeTotal++; if (v === 0) strokeDark++; } else { paperTotal++; if (v === 255) paperWhite++; }
    }
  }
  assert.ok(strokeDark / strokeTotal > 0.9, `strokes survived: ${strokeDark}/${strokeTotal}`);
  assert.ok(paperWhite / paperTotal > 0.9, `paper stayed clean: ${paperWhite}/${paperTotal}`);
});

test('grayscale returns a histogram that sums to the pixel count', () => {
  const d = buffer(9, 9, (x) => x * 20);
  const { hist, n } = grayscale(d, 9, 9);
  assert.equal(n, 81);
  assert.equal(hist.reduce((a, b) => a + b, 0), 81);
});

// --- the canonical label map -----------------------------------------------

test('one label map and one set of confidence thresholds, shared by every screen', () => {
  assert.equal(variantLabel('threshold'), 'High contrast');
  assert.equal(variantLabel('nonsense'), 'nonsense');
  assert.equal(sourceLabel('flat'), 'Flattened from an angle');
  assert.ok(CONFIDENCE_GOOD > CONFIDENCE_FAIR);
  assert.equal(confidenceBand(CONFIDENCE_GOOD), 'good');
  assert.equal(confidenceBand(CONFIDENCE_GOOD - 1), 'fair');
  assert.equal(confidenceBand(CONFIDENCE_FAIR - 1), 'poor');
  assert.equal(confidenceBand(undefined), 'poor');
  // The bug this replaced: a 78% scan read green on one screen, amber on the
  // next, because the two screens disagreed about the threshold.
  // Pinned at the exact boundary: CONFIDENCE_GOOD is 78, and 78 must read the
  // same everywhere. One source, inclusive bound.
  assert.equal(confidenceBand(CONFIDENCE_GOOD), 'good');
  assert.equal(confidenceBand(CONFIDENCE_GOOD - 1), 'fair');
  assert.equal(confidenceBand(CONFIDENCE_FAIR), 'fair');
  assert.equal(confidenceVerdict(78, 3).band, confidenceBand(78));
  assert.equal(confidenceVerdict(95, 0).head, "Couldn't read it");
});
