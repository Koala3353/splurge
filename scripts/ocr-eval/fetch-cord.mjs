#!/usr/bin/env node
// Downloads CORD-v2 (naver-clova-ix/cord-v2, CC BY 4.0) into a directory you
// name, via the public Hugging Face datasets-server rows API. No auth needed.
//
//   node scripts/ocr-eval/fetch-cord.mjs <outDir> [split] [count]
//
// outDir MUST be outside this repo — the corpus is ~200MB of untrusted image
// data and has no business in git. Writes <outDir>/images/<split>-NNNN.jpg and
// <outDir>/<split>-gt.jsonl (one JSON record per receipt, annotations verbatim).

import fs from 'node:fs/promises';
import path from 'node:path';

const [outDir, split = 'test', countArg = '100'] = process.argv.slice(2);
if (!outDir) {
  console.error('usage: fetch-cord.mjs <outDir> [test|validation|train] [count]');
  process.exit(2);
}
const count = Number(countArg);

const API = 'https://datasets-server.huggingface.co/rows';
const DS = 'naver-clova-ix%2Fcord-v2';

await fs.mkdir(path.join(outDir, 'images'), { recursive: true });

const records = [];
for (let offset = 0; offset < count; offset += 50) {
  const length = Math.min(50, count - offset);
  const res = await fetch(`${API}?dataset=${DS}&config=default&split=${split}&offset=${offset}&length=${length}`);
  if (!res.ok) throw new Error(`rows ${offset}: ${res.status}`);
  const json = await res.json();
  if (!json.rows?.length) break;
  for (const r of json.rows) {
    const src = r.row.image?.src;
    if (!src) continue;
    const imgRes = await fetch(src);
    if (!imgRes.ok) { console.error(`\nskip ${r.row_idx}: image ${imgRes.status}`); continue; }
    const buf = Buffer.from(await imgRes.arrayBuffer());
    const file = `${split}-${String(r.row_idx).padStart(4, '0')}.jpg`;
    await fs.writeFile(path.join(outDir, 'images', file), buf);
    records.push({ id: file, split, row_idx: r.row_idx, bytes: buf.length, ground_truth: r.row.ground_truth });
    process.stdout.write('.');
  }
}

await fs.writeFile(
  path.join(outDir, `${split}-gt.jsonl`),
  `${records.map((r) => JSON.stringify(r)).join('\n')}\n`,
);
console.log(`\n${records.length} annotated receipts -> ${outDir}`);
console.log('CORD-v2 is CC BY 4.0: Park et al., "CORD: A Consolidated Receipt Dataset for Post-OCR Parsing" (2019).');
