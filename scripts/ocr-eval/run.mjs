#!/usr/bin/env node
// Scored evaluation of the REAL receipt pipeline against a real corpus.
//
//   node scripts/ocr-eval/run.mjs --limit 50
//
// Flags:
//   --data <dir>        dataset root (default $OCR_EVAL_DATA)
//   --limit <n>         how many receipts to score (default 50)
//   --offset <n>        skip the first n (for disjoint dev/holdout slices)
//   --splits a,b        which ground-truth files to read (default test,validation)
//   --out <file>        per-receipt JSON (default scripts/ocr-eval/results/<label>.json)
//   --label <name>      names the run and its output file (default "run")
//   --legacy            run the pre-revamp candidate ordering, for A/B
//   --canvas-dir <dir>  where to find @napi-rs/canvas, if not a devDependency
//   --compare <file>    diff this run's summary against an earlier JSON
//
// The dataset directory is passed in and only ever read. Nothing in it is
// executed, and this script never runs with it as its working directory.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = { limit: 50, offset: 0, splits: 'test,validation', label: 'run' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    if (key === 'legacy') { out.legacy = true; continue; }
    out[key] = argv[++i];
  }
  out.limit = Number(out.limit);
  out.offset = Number(out.offset);
  return out;
}

const pct = (v) => (v === null || v === undefined ? '  n/a' : `${(v * 100).toFixed(1)}%`);

function table(summary) {
  const rows = [
    ['receipts scored', String(summary.receipts)],
    ['ground-truth items', String(summary.truthItems)],
    ['parsed items', String(summary.parsedItems)],
    ['', ''],
    ['line-item recall', pct(summary.itemRecall)],
    ['line-item precision', pct(summary.itemPrecision)],
    ['line-item F1', pct(summary.itemF1)],
    ['price-attachment acc.', pct(summary.priceAttachment)],
    ['strict (name+price) F1', pct(summary.strictF1)],
    ['', ''],
    ['bill total agrees', pct(summary.totalAgreeRate)],
    ['service-charge recall', `${pct(summary.serviceRecall)} (n=${summary.serviceExpected})`],
    ['discount recall', `${pct(summary.discountRecall)} (n=${summary.discountExpected})`],
    ['summary rows leaked', String(summary.leakedSummaryRows)],
    ['receipts with 0 items', String(summary.zeroItemReceipts)],
    ['', ''],
    ['mean time / receipt', `${(summary.meanMs / 1000).toFixed(2)}s`],
    ['median time / receipt', `${(summary.medianMs / 1000).toFixed(2)}s`],
    ['p90 time / receipt', `${(summary.p90Ms / 1000).toFixed(2)}s`],
  ];
  const w = Math.max(...rows.map((r) => r[0].length));
  return rows.map(([k, v]) => (k ? `  ${k.padEnd(w)}   ${v}` : '')).join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dataDir = args.data || process.env.OCR_EVAL_DATA;
  if (!dataDir) {
    console.error('No dataset. Pass --data <dir> or set OCR_EVAL_DATA.');
    console.error('See scripts/ocr-eval/README.md for how to fetch CORD-v2.');
    process.exit(2);
  }

  const { installNodeCanvas } = await import('./node-canvas.mjs');
  await installNodeCanvas(args['canvas-dir']);

  const { loadDataset, readImage } = await import('./dataset.mjs');
  const { scoreReceipt, aggregate } = await import('./score.mjs');
  const { scanReceipt, terminateOcr, LEGACY_TUNING, DEFAULT_TUNING } = await import('../../src/utils/ocr.js');
  const { parseReceiptFull } = await import('../../src/utils/receipt.js');

  const all = await loadDataset(path.resolve(dataDir), args.splits.split(',').map((s) => s.trim()));
  const corpus = all.slice(args.offset, args.offset + args.limit);
  if (!corpus.length) {
    console.error(`No annotated receipts found under ${dataDir}.`);
    process.exit(2);
  }

  const tuning = args.legacy ? LEGACY_TUNING : DEFAULT_TUNING;
  console.log(`\nocr-eval "${args.label}" — ${corpus.length} receipts, tuning=${args.legacy ? 'legacy' : 'default'}\n`);

  const rows = [];
  for (const rec of corpus) {
    const bytes = await readImage(rec.imagePath);
    const t0 = performance.now();
    let text = ''; let diagnostics = null; let error = null;
    try {
      const res = await scanReceipt(bytes, null, { tuning, timeoutMs: 120_000 });
      text = res.text; diagnostics = res.diagnostics;
    } catch (e) { error = String(e && e.message || e); }
    const ms = performance.now() - t0;
    const parsed = parseReceiptFull(text);
    const row = scoreReceipt(parsed, rec);
    row.ms = ms;
    row.error = error;
    row.confidence = diagnostics?.confidence ?? null;
    row.variant = diagnostics?.variant ?? null;
    row.source = diagnostics?.source ?? null;
    row.orientation = diagnostics?.orientation ?? null;
    row.relaid = diagnostics?.relaid ?? null;
    row.attempts = diagnostics?.attempts ?? null;
    // The recognised text is kept so parser-only changes can be replayed
    // against a frozen OCR run (replay.mjs) instead of paying for OCR again.
    row.text = text;
    rows.push(row);
    process.stdout.write(
      `  ${row.id.padEnd(20)} items ${String(row.matched).padStart(2)}/${String(row.truthItems).padStart(2)}`
      + ` price ${pct(row.priceAttachment).padStart(6)}  ${(ms / 1000).toFixed(1)}s`
      + `${error ? `  ERROR ${error}` : ''}\n`,
    );
  }

  await terminateOcr();

  const summary = aggregate(rows);
  summary.label = args.label;
  summary.tuning = args.legacy ? 'legacy' : 'default';
  summary.tuningValues = tuning;
  summary.when = new Date().toISOString();
  summary.dataset = 'CORD-v2 (naver-clova-ix/cord-v2), CC BY 4.0';

  console.log(`\n${'='.repeat(52)}\n  ${args.label}\n${'='.repeat(52)}`);
  console.log(table(summary));

  // Confidence calibration: does the number shown to the user track accuracy?
  const withConf = rows.filter((r) => Number.isFinite(r.confidence));
  if (withConf.length > 4) {
    const bands = [[0, 58, 'poor  <58'], [58, 78, 'fair 58-77'], [78, 101, 'good  >=78']];
    console.log('\n  confidence band      n   strict F1');
    for (const [lo, hi, name] of bands) {
      const b = withConf.filter((r) => r.confidence >= lo && r.confidence < hi);
      if (!b.length) continue;
      const agg = aggregate(b);
      console.log(`  ${name.padEnd(12)} ${String(b.length).padStart(5)}   ${pct(agg.strictF1)}`);
    }
    summary.calibration = bands.map(([lo, hi, name]) => {
      const b = withConf.filter((r) => r.confidence >= lo && r.confidence < hi);
      return { band: name.trim(), n: b.length, strictF1: b.length ? aggregate(b).strictF1 : null };
    });
  }

  const outPath = path.resolve(args.out || path.join(here, 'results', `${args.label}.json`));
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, `${JSON.stringify({ summary, rows }, null, 2)}\n`);
  console.log(`\n  per-receipt results -> ${outPath}\n`);

  if (args.compare) {
    const prev = JSON.parse(await fs.readFile(path.resolve(args.compare), 'utf8'));
    const keys = ['itemRecall', 'itemPrecision', 'itemF1', 'priceAttachment', 'strictF1', 'totalAgreeRate'];
    console.log(`  vs ${prev.summary.label}:`);
    for (const k of keys) {
      const d = (summary[k] - prev.summary[k]) * 100;
      console.log(`    ${k.padEnd(18)} ${pct(prev.summary[k])} -> ${pct(summary[k])}  ${d >= 0 ? '+' : ''}${d.toFixed(1)}pp`);
    }
    console.log('');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
