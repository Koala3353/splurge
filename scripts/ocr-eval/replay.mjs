#!/usr/bin/env node
// Re-score a finished run's recognised text with the CURRENT parser.
//
//   node scripts/ocr-eval/replay.mjs scripts/ocr-eval/results/baseline.json --data <dir>
//
// OCR is the expensive half and it does not change when receipt.js changes.
// Replaying a frozen run turns a seven-minute experiment into a one-second
// one, which is the difference between tuning the parser against measurements
// and tuning it against intuition.
//
// It cannot evaluate preprocessing or candidate-ordering changes — those need
// a real run.mjs pass.

import fs from 'node:fs/promises';
import path from 'node:path';

const argv = process.argv.slice(2);
const runFile = argv.find((a) => !a.startsWith('--'));
const arg = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? dflt : argv[i + 1];
};
if (!runFile) { console.error('usage: replay.mjs <results.json> [--data <dir>]'); process.exit(2); }

const dataDir = arg('data', process.env.OCR_EVAL_DATA);
if (!dataDir) { console.error('--data <dir> (or $OCR_EVAL_DATA) is required'); process.exit(2); }

const { loadDataset } = await import('./dataset.mjs');
const { scoreReceipt, aggregate } = await import('./score.mjs');
const { parseReceiptFull } = await import('../../src/utils/receipt.js');

const prev = JSON.parse(await fs.readFile(path.resolve(runFile), 'utf8'));
if (!prev.rows.some((r) => typeof r.text === 'string')) {
  console.error('That run predates text capture — re-run run.mjs to use replay.');
  process.exit(2);
}
const truth = new Map((await loadDataset(path.resolve(dataDir))).map((t) => [t.id, t]));

const rows = [];
for (const old of prev.rows) {
  const t = truth.get(old.id);
  if (!t || typeof old.text !== 'string') continue;
  const row = scoreReceipt(parseReceiptFull(old.text), t);
  row.ms = old.ms;
  row.confidence = old.confidence;
  rows.push(row);
}

const now = aggregate(rows);
const before = prev.summary;
const pct = (v) => (v === null || v === undefined ? '  n/a' : `${(v * 100).toFixed(1)}%`);
console.log(`\n  replay of "${before.label}" with the current parser (${rows.length} receipts)\n`);
for (const k of ['itemRecall', 'itemPrecision', 'itemF1', 'priceAttachment', 'strictF1', 'totalAgreeRate', 'serviceRecall', 'discountRecall']) {
  const d = ((now[k] ?? 0) - (before[k] ?? 0)) * 100;
  console.log(`  ${k.padEnd(18)} ${pct(before[k])} -> ${pct(now[k])}   ${d >= 0 ? '+' : ''}${d.toFixed(1)}pp`);
}
console.log(`  ${'leakedSummaryRows'.padEnd(18)} ${before.leakedSummaryRows} -> ${now.leakedSummaryRows}`);
console.log(`  ${'zeroItemReceipts'.padEnd(18)} ${before.zeroItemReceipts} -> ${now.zeroItemReceipts}\n`);

if (arg('out')) {
  await fs.writeFile(path.resolve(arg('out')), `${JSON.stringify({ summary: { ...now, label: `${before.label}+replay` }, rows }, null, 2)}\n`);
}
