// Scoring one parsed receipt against its ground truth.
//
// Two deliberate choices, both of which make the numbers comparable rather
// than flattering:
//
// 1. NAME MATCHING is fuzzy (normalised edit similarity ≥ NAME_THRESHOLD) and
//    greedy-best-first. OCR of thermal print is never character-exact, so
//    exact matching would report near-zero recall for a pipeline that is
//    actually producing usable item lists.
// 2. PRICE MATCHING tolerates a 10^k scale factor. CORD is an Indonesian
//    corpus: "60.000" means sixty thousand rupiah, while this parser (built
//    for peso receipts) reads the dot as a decimal point and returns 60.00.
//    That is a currency-convention mismatch, not a price-binding error, and
//    scoring it as a failure would hide the thing we actually want to
//    measure — whether the RIGHT NUMBER ended up on the RIGHT ITEM.

const NAME_THRESHOLD = 0.6;

const norm = (s) => String(s || '')
  .toLowerCase()
  .replace(/[^a-z0-9 ]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

function editDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export function nameSimilarity(a, b) {
  const x = norm(a); const y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const d = editDistance(x, y);
  const sim = 1 - d / Math.max(x.length, y.length);
  // A short OCR fragment of a long name ("Chicken" of "Chicken Teriyaki Set")
  // is a correct detection with a clipped name, not a miss.
  const contains = x.includes(y) || y.includes(x);
  return contains ? Math.max(sim, 0.75) : sim;
}

/** Equal up to a power-of-ten scale factor — see the note at the top. */
export function priceMatches(parsed, truth) {
  if (!Number.isFinite(parsed) || !Number.isFinite(truth)) return false;
  const p = Math.abs(parsed); const t = Math.abs(truth);
  if (p === 0 && t === 0) return true;
  for (const k of [1, 10, 100, 1000, 10000]) {
    if (Math.abs(p * k - t) <= Math.max(0.011 * t, 0.011)) return true;
    if (Math.abs(p - t * k) <= Math.max(0.011 * p, 0.011)) return true;
  }
  return false;
}

/**
 * Greedy best-first bipartite match of parsed items to ground-truth items.
 * Returns { pairs, unmatchedTruth, unmatchedParsed }.
 */
export function matchItems(parsedItems, truthItems) {
  const cand = [];
  for (let i = 0; i < parsedItems.length; i++) {
    for (let j = 0; j < truthItems.length; j++) {
      const sim = nameSimilarity(parsedItems[i].name, truthItems[j].name);
      if (sim >= NAME_THRESHOLD) cand.push({ i, j, sim });
    }
  }
  cand.sort((a, b) => b.sim - a.sim);
  const usedP = new Set(); const usedT = new Set();
  const pairs = [];
  for (const c of cand) {
    if (usedP.has(c.i) || usedT.has(c.j)) continue;
    usedP.add(c.i); usedT.add(c.j);
    pairs.push({ parsed: parsedItems[c.i], truth: truthItems[c.j], sim: c.sim });
  }
  return {
    pairs,
    unmatchedTruth: truthItems.filter((_, j) => !usedT.has(j)),
    unmatchedParsed: parsedItems.filter((_, i) => !usedP.has(i)),
  };
}

const f1 = (p, r) => (p + r > 0 ? (2 * p * r) / (p + r) : 0);

/**
 * @param {{items:Array,fees:Array}} parsed  output of parseReceiptFull
 * @param {object} truth  a record from dataset.mjs
 */
export function scoreReceipt(parsed, truth) {
  const { pairs, unmatchedTruth, unmatchedParsed } = matchItems(parsed.items, truth.items);

  const priced = pairs.filter((p) => priceMatches(p.parsed.price, p.truth.price));
  const itemRecall = truth.items.length ? pairs.length / truth.items.length : 0;
  const itemPrecision = parsed.items.length ? pairs.length / parsed.items.length : 0;
  // Strict = the name was found AND the right price is bound to it. This is
  // the metric that matters for a bill splitter: a correct name with the
  // neighbouring row's price is worse than no row at all.
  const strictRecall = truth.items.length ? priced.length / truth.items.length : 0;
  const strictPrecision = parsed.items.length ? priced.length / parsed.items.length : 0;

  // Did the pipeline leak a summary line (total / subtotal / tax / change)
  // into the item list? Measured by value, since the names are garbled.
  const summaryValues = [truth.total, truth.subtotal, truth.tax, truth.service]
    .filter((v) => Number.isFinite(v) && v !== null);
  const leaked = unmatchedParsed.filter(
    (it) => summaryValues.some((v) => priceMatches(it.price, v)),
  ).length;

  // Fees the parser surfaced as shared adjustments.
  const serviceFee = parsed.fees.find((f) => f.amount > 0);
  const discountFee = parsed.fees.find((f) => f.amount < 0);
  const hasService = Number.isFinite(truth.service) && truth.service > 0;
  const hasDiscount = Number.isFinite(truth.discount) && truth.discount !== 0;

  // "Does the parsed bill add up to the printed total?" — the end-to-end
  // question a user actually cares about.
  const parsedSum = parsed.items.reduce((s, it) => s + (Number(it.price) || 0), 0)
    + parsed.fees.reduce((s, f) => s + (Number(f.amount) || 0), 0);
  const totalAgrees = priceMatches(parsedSum, truth.total);

  return {
    id: truth.id,
    truthItems: truth.items.length,
    parsedItems: parsed.items.length,
    matched: pairs.length,
    pricedCorrect: priced.length,
    leakedSummaryRows: leaked,
    itemRecall,
    itemPrecision,
    itemF1: f1(itemPrecision, itemRecall),
    priceAttachment: pairs.length ? priced.length / pairs.length : 0,
    strictRecall,
    strictPrecision,
    strictF1: f1(strictPrecision, strictRecall),
    totalAgrees,
    parsedSum,
    truthTotal: truth.total,
    service: { expected: hasService, found: !!serviceFee, correct: hasService && !!serviceFee && priceMatches(serviceFee.amount, truth.service) },
    discount: { expected: hasDiscount, found: !!discountFee, correct: hasDiscount && !!discountFee && priceMatches(discountFee.amount, truth.discount) },
    missed: unmatchedTruth.slice(0, 8).map((t) => t.name),
    spurious: unmatchedParsed.slice(0, 8).map((t) => `${t.name}=${t.price}`),
  };
}

/** Corpus-level roll-up. Micro-averaged, so big receipts count for more. */
export function aggregate(rows) {
  const sum = (f) => rows.reduce((s, r) => s + f(r), 0);
  const truth = sum((r) => r.truthItems);
  const got = sum((r) => r.parsedItems);
  const matched = sum((r) => r.matched);
  const priced = sum((r) => r.pricedCorrect);
  const recall = truth ? matched / truth : 0;
  const precision = got ? matched / got : 0;
  const sRecall = truth ? priced / truth : 0;
  const sPrecision = got ? priced / got : 0;
  const svcExpected = rows.filter((r) => r.service.expected);
  const discExpected = rows.filter((r) => r.discount.expected);
  const times = rows.map((r) => r.ms).filter(Number.isFinite).sort((a, b) => a - b);
  return {
    receipts: rows.length,
    truthItems: truth,
    parsedItems: got,
    itemRecall: recall,
    itemPrecision: precision,
    itemF1: f1(precision, recall),
    priceAttachment: matched ? priced / matched : 0,
    strictRecall: sRecall,
    strictPrecision: sPrecision,
    strictF1: f1(sPrecision, sRecall),
    leakedSummaryRows: sum((r) => r.leakedSummaryRows),
    zeroItemReceipts: rows.filter((r) => r.parsedItems === 0).length,
    totalAgreeRate: rows.length ? rows.filter((r) => r.totalAgrees).length / rows.length : 0,
    serviceRecall: svcExpected.length ? svcExpected.filter((r) => r.service.correct).length / svcExpected.length : null,
    serviceExpected: svcExpected.length,
    discountRecall: discExpected.length ? discExpected.filter((r) => r.discount.correct).length / discExpected.length : null,
    discountExpected: discExpected.length,
    meanMs: times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0,
    medianMs: times.length ? times[Math.floor(times.length / 2)] : 0,
    p90Ms: times.length ? times[Math.floor(times.length * 0.9)] : 0,
  };
}
