#!/usr/bin/env node
// Robustness against the failure modes the corpus cannot show us.
//
// CORD-v2 is photographed, but it is photographed WELL: measured over the 60
// scored receipts, illumination non-uniformity correlates with strict F1 at
// r = 0.03 and blur at r = 0.15. Whatever makes those receipts hard, it is not
// the lighting. So a change aimed at shadows, hard-edged shade, steep angles
// or thermal fade cannot be credited — or refuted — by the main harness.
//
// This script degrades receipts the pipeline ALREADY READS WELL, by a known
// amount, and re-scores them. The absolute numbers are synthetic and should
// never be quoted beside the CORD table; what they measure is how much of a
// good read survives a named insult, and whether a change improves that.
//
//   node scripts/ocr-eval/synthetic.mjs --data <dir> --from <results.json>
//
// Flags:
//   --from <file>   a finished run; its best-scoring receipts become the base
//   --take <n>      how many base receipts (default 12)
//   --modes a,b     shadow,hardshadow,perspective,blur,fade (default all)
//   --legacy        run with LEGACY_TUNING, for an A/B of the pipeline knobs
//   --tuning k=v,.. override individual tuning knobs (booleans)
//   --out <file>    write the per-condition JSON
//
// Degraded images are written to a scratch directory passed in with --scratch
// (or $TMPDIR), never into the repo and never into the dataset directory.

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? dflt : argv[i + 1];
};
const has = (name) => argv.includes(`--${name}`);

const dataDir = arg('data', process.env.OCR_EVAL_DATA);
if (!dataDir) { console.error('--data <dir> (or $OCR_EVAL_DATA) is required'); process.exit(2); }
const fromFile = arg('from');
if (!fromFile) { console.error('--from <results.json> is required'); process.exit(2); }

const { installNodeCanvas } = await import('./node-canvas.mjs');
const napi = await installNodeCanvas(arg('canvas-dir'));

const { loadDataset } = await import('./dataset.mjs');
const { scoreReceipt, aggregate } = await import('./score.mjs');
const { scanReceipt, terminateOcr, LEGACY_TUNING, DEFAULT_TUNING } = await import('../../src/utils/ocr.js');
const { parseReceiptFull } = await import('../../src/utils/receipt.js');

// --- degradations ----------------------------------------------------------
// Each takes a loaded image and returns a PNG Buffer. They are deliberately
// crude and deterministic: the point is a repeatable insult of a known kind,
// not photorealism.

function draw(img) {
  const c = napi.createCanvas(img.width, img.height);
  c.getContext('2d').drawImage(img, 0, 0);
  return c;
}

/** Smooth lighting ramp across the diagonal — an overhead light to one side. */
function shadow(img, { low = 0.28 } = {}) {
  const c = draw(img);
  const ctx = c.getContext('2d');
  const id = ctx.getImageData(0, 0, c.width, c.height);
  const d = id.data;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const u = (x / c.width + y / c.height) / 2;
      const k = low + (1 - low) * (1 - u);
      const p = (y * c.width + x) * 4;
      d[p] *= k; d[p + 1] *= k; d[p + 2] *= k;
    }
  }
  ctx.putImageData(id, 0, 0);
  return c.toBuffer('image/png');
}

/** A hard-edged shade line with a narrow penumbra — a body or a table edge. */
function hardshadow(img, { low = 0.3, at = 0.45, soft = 0.04 } = {}) {
  const c = draw(img);
  const ctx = c.getContext('2d');
  const id = ctx.getImageData(0, 0, c.width, c.height);
  const d = id.data;
  for (let y = 0; y < c.height; y++) {
    const u = y / c.height;
    // Diagonal edge so it crosses the price column as well as the names.
    for (let x = 0; x < c.width; x++) {
      const edge = at + 0.25 * (x / c.width);
      const t = Math.min(1, Math.max(0, (u - edge) / soft));
      const k = 1 - (1 - low) * t;
      const p = (y * c.width + x) * 4;
      d[p] *= k; d[p + 1] *= k; d[p + 2] *= k;
    }
  }
  ctx.putImageData(id, 0, 0);
  return c.toBuffer('image/png');
}

/** Steep angle: the far edge of the paper compressed, as if shot from low. */
function perspective(img, { squeeze = 0.42 } = {}) {
  const W = img.width; const H = img.height;
  const src = draw(img).getContext('2d').getImageData(0, 0, W, H).data;
  const out = napi.createCanvas(W, H);
  const octx = out.getContext('2d');
  const od = octx.createImageData(W, H);
  const o = od.data;
  // Destination row y maps to a source row; the top of the frame is narrowed
  // toward the centre by `squeeze`, which is what a tilt actually does.
  for (let y = 0; y < H; y++) {
    const v = y / (H - 1);
    const width = squeeze + (1 - squeeze) * v;          // 0..1 of full width
    for (let x = 0; x < W; x++) {
      const u = x / (W - 1);
      const sx = (u - 0.5) / width * (W - 1) + (W - 1) / 2;
      // Foreshortening: rows bunch up toward the far edge.
      const sy = (v * v * 0.45 + v * 0.55) * (H - 1);
      const p = (y * W + x) * 4;
      if (sx < 0 || sx > W - 1) { o[p] = o[p + 1] = o[p + 2] = 235; o[p + 3] = 255; continue; }
      const x0 = sx | 0; const y0 = sy | 0;
      const x1 = Math.min(W - 1, x0 + 1); const y1 = Math.min(H - 1, y0 + 1);
      const fx = sx - x0; const fy = sy - y0;
      for (let ch = 0; ch < 3; ch++) {
        const a = src[(y0 * W + x0) * 4 + ch]; const b = src[(y0 * W + x1) * 4 + ch];
        const cc = src[(y1 * W + x0) * 4 + ch]; const dd = src[(y1 * W + x1) * 4 + ch];
        o[p + ch] = (a * (1 - fx) + b * fx) * (1 - fy) + (cc * (1 - fx) + dd * fx) * fy;
      }
      o[p + 3] = 255;
    }
  }
  octx.putImageData(od, 0, 0);
  return out.toBuffer('image/png');
}

/** Camera shake / missed focus. */
function blur(img, { radius = 2 } = {}) {
  const c = draw(img);
  const ctx = c.getContext('2d');
  const W = c.width; const H = c.height;
  const id = ctx.getImageData(0, 0, W, H);
  const d = id.data;
  const copy = Uint8ClampedArray.from(d);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      for (let ch = 0; ch < 3; ch++) {
        let s = 0; let n = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          const yy = y + dy; if (yy < 0 || yy >= H) continue;
          for (let dx = -radius; dx <= radius; dx++) {
            const xx = x + dx; if (xx < 0 || xx >= W) continue;
            s += copy[(yy * W + xx) * 4 + ch]; n++;
          }
        }
        d[(y * W + x) * 4 + ch] = s / n;
      }
    }
  }
  ctx.putImageData(id, 0, 0);
  return c.toBuffer('image/png');
}

/** Thermal fade: ink drifts toward the paper, the whole range compresses. */
function fade(img, { keep = 0.34, lift = 150 } = {}) {
  const c = draw(img);
  const ctx = c.getContext('2d');
  const id = ctx.getImageData(0, 0, c.width, c.height);
  const d = id.data;
  for (let p = 0; p < d.length; p += 4) {
    for (let ch = 0; ch < 3; ch++) d[p + ch] = lift + (d[p + ch] - lift) * keep;
  }
  ctx.putImageData(id, 0, 0);
  return c.toBuffer('image/png');
}

const MODES = { clean: null, shadow, hardshadow, perspective, blur, fade };

// --- run -------------------------------------------------------------------

const prev = JSON.parse(await fs.readFile(path.resolve(fromFile), 'utf8'));
const truth = new Map((await loadDataset(path.resolve(dataDir))).map((t) => [t.id, t]));

// Base set = the receipts this pipeline already reads well. Degrading a photo
// it cannot read anyway measures nothing.
const take = Number(arg('take', 12));
const base = prev.rows
  .filter((r) => truth.has(r.id) && r.strictF1 > 0.45)
  .sort((a, b) => b.strictF1 - a.strictF1 || b.truthItems - a.truthItems)
  .slice(0, take);
if (!base.length) { console.error('No well-read receipts in that run to degrade.'); process.exit(2); }

const modes = (arg('modes', 'clean,shadow,hardshadow,perspective,blur,fade')).split(',').map((s) => s.trim());
const tuning = { ...(has('legacy') ? LEGACY_TUNING : DEFAULT_TUNING) };
for (const kv of (arg('tuning', '') || '').split(',').filter(Boolean)) {
  const [k, v] = kv.split('=');
  tuning[k.trim()] = v === 'true' ? true : v === 'false' ? false : Number(v);
}

const scratch = await fs.mkdtemp(path.join(arg('scratch', os.tmpdir()), 'ocr-synth-'));
console.log(`\nsynthetic robustness — ${base.length} well-read receipts, ${modes.length} conditions`);
console.log(`  (synthetic degradations; NOT comparable to the CORD table)\n`);

const results = {};
for (const mode of modes) {
  const fn = MODES[mode];
  if (fn === undefined) { console.error(`unknown mode ${mode}`); continue; }
  const rows = [];
  for (const b of base) {
    const bytes = await fs.readFile(path.join(dataDir, 'images', b.id));
    let input = bytes;
    if (fn) {
      const img = await napi.loadImage(bytes);
      const png = fn(img);
      const p = path.join(scratch, `${mode}-${b.id}.png`);
      await fs.writeFile(p, png);
      input = png;
    }
    let text = '';
    const t0 = performance.now();
    try { ({ text } = await scanReceipt(input, null, { tuning, timeoutMs: 120_000 })); } catch { /* scored as nothing */ }
    const ms = performance.now() - t0;
    const row = scoreReceipt(parseReceiptFull(text), truth.get(b.id));
    row.ms = ms;
    rows.push(row);
  }
  const agg = aggregate(rows);
  results[mode] = agg;
  console.log(`  ${mode.padEnd(12)} itemF1 ${(agg.itemF1 * 100).toFixed(1).padStart(5)}%   strictF1 ${(agg.strictF1 * 100).toFixed(1).padStart(5)}%`
    + `   zero-item ${String(agg.zeroItemReceipts).padStart(2)}/${rows.length}   ${(agg.meanMs / 1000).toFixed(2)}s`);
}

const cleanF1 = results.clean?.strictF1;
if (Number.isFinite(cleanF1) && cleanF1 > 0) {
  console.log('\n  retained vs clean (strict F1):');
  for (const [mode, agg] of Object.entries(results)) {
    if (mode === 'clean') continue;
    console.log(`    ${mode.padEnd(12)} ${((agg.strictF1 / cleanF1) * 100).toFixed(0)}%`);
  }
}

await terminateOcr();
await fs.rm(scratch, { recursive: true, force: true });

if (arg('out')) {
  await fs.writeFile(path.resolve(arg('out')), `${JSON.stringify({
    kind: 'synthetic', when: new Date().toISOString(), base: base.map((b) => b.id), tuning, results,
  }, null, 2)}\n`);
}
void here;
console.log('');
