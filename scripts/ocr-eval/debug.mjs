#!/usr/bin/env node
// Dump what the pipeline actually saw and produced for ONE image — the fastest
// way to tell "the preprocessing destroyed it" from "the parser dropped it".
//
//   node scripts/ocr-eval/debug.mjs <image> [--raw] [--canvas-dir <dir>]
//
// --raw additionally recognises the untouched image, so the preprocessing
// chain can be compared against doing nothing at all.

import fs from 'node:fs/promises';

const argv = process.argv.slice(2);
const image = argv.find((a) => !a.startsWith('--'));
const flag = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? undefined : (argv[i + 1]?.startsWith('--') ? true : argv[i + 1] ?? true);
};
if (!image) { console.error('usage: debug.mjs <image> [--raw] [--canvas-dir <dir>]'); process.exit(2); }

const { installNodeCanvas } = await import('./node-canvas.mjs');
await installNodeCanvas(flag('canvas-dir'));

const { scanReceipt, terminateOcr, warmUpOcr, LEGACY_TUNING, DEFAULT_TUNING } = await import('../../src/utils/ocr.js');
const { parseReceiptFull } = await import('../../src/utils/receipt.js');
const { toRecognizerInput } = await import('../../src/utils/ocr/env.js');

const bytes = await fs.readFile(image);

if (flag('raw')) {
  const worker = await warmUpOcr();
  await worker.setParameters({ tessedit_pageseg_mode: '6' });
  const { data } = await worker.recognize(bytes, {}, { text: true });
  console.log(`--- RAW (no preprocessing), confidence ${Math.round(data.confidence)} ---`);
  console.log(data.text);
  console.log('--- raw parse ---');
  console.log(JSON.stringify(parseReceiptFull(data.text), null, 1));
}

const res = await scanReceipt(bytes, null, {
  tuning: flag('legacy') ? LEGACY_TUNING : DEFAULT_TUNING,
  timeoutMs: 120_000,
});
console.log('--- PIPELINE diagnostics ---');
console.log(JSON.stringify({ ...res.diagnostics, preview: undefined }, null, 1));
console.log('--- PIPELINE text ---');
console.log(res.text);
console.log('--- parse ---');
console.log(JSON.stringify(parseReceiptFull(res.text), null, 1));
void toRecognizerInput;
await terminateOcr();
