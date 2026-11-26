// Reads a downloaded receipt corpus into the shape the scorer wants.
//
// SAFETY: everything in here treats the dataset as DATA. Annotation strings
// are never evaluated, never used as paths, and never interpreted as anything
// but text. The dataset lives outside the repo and its directory is passed in
// as an argument, so no interpreter ever runs with it as cwd.

import fs from 'node:fs/promises';
import path from 'node:path';

/** CORD-v2 prices are Indonesian-formatted ("60.000" = sixty thousand). */
function gtPrice(raw) {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).replace(/[^\d.,-]/g, '');
  if (!s) return null;
  // Strip grouping separators entirely, then re-read: CORD writes rupiah with
  // '.' as a thousands separator and (rarely) ',00' as a decimal tail.
  const neg = /^-/.test(s);
  const digits = s.replace(/[^\d]/g, '');
  if (!digits) return null;
  const v = Number(digits);
  return neg ? -v : v;
}

const asArray = (v) => (v === undefined || v === null ? [] : (Array.isArray(v) ? v : [v]));

function parseCordRecord(rec, imagesDir) {
  let gt;
  try { gt = JSON.parse(rec.ground_truth); } catch { return null; }
  const parse = gt?.gt_parse;
  if (!parse) return null;

  const items = [];
  for (const m of asArray(parse.menu)) {
    const name = typeof m?.nm === 'string' ? m.nm : Array.isArray(m?.nm) ? m.nm.join(' ') : '';
    const price = gtPrice(m?.price ?? m?.unitprice);
    if (!name.trim()) continue;
    items.push({ name: name.trim(), price, count: Number(String(m?.cnt ?? '1').replace(/[^\d]/g, '')) || 1 });
    // Sub-items ("sub_nm"/"sub_price") are add-ons printed on their own row.
    for (const s of asArray(m?.sub)) {
      const sn = typeof s?.sub_nm === 'string' ? s.sub_nm : '';
      if (sn.trim()) items.push({ name: sn.trim(), price: gtPrice(s?.sub_price), count: 1, sub: true });
    }
  }

  const sub = asArray(parse.sub_total)[0] || {};
  const tot = asArray(parse.total)[0] || {};
  return {
    id: rec.id,
    imagePath: path.join(imagesDir, rec.id),
    items,
    subtotal: gtPrice(sub.subtotal_price),
    tax: gtPrice(sub.tax_price),
    service: gtPrice(sub.service_price),
    discount: gtPrice(sub.discount_price),
    total: gtPrice(tot.total_price),
  };
}

/**
 * @param {string} dir  dataset root (contains images/ and *-gt.jsonl)
 * @param {string[]} splits  which gt files to read
 */
export async function loadDataset(dir, splits = ['test', 'validation']) {
  const imagesDir = path.join(dir, 'images');
  const out = [];
  for (const split of splits) {
    let text;
    try { text = await fs.readFile(path.join(dir, `${split}-gt.jsonl`), 'utf8'); } catch { continue; }
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      let rec;
      try { rec = JSON.parse(line); } catch { continue; }
      const parsed = parseCordRecord(rec, imagesDir);
      if (parsed && parsed.items.length) out.push(parsed);
    }
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

export const readImage = (p) => fs.readFile(p);
