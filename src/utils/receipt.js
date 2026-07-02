// Receipt OCR text -> line items, tuned for Philippine restaurant receipts.
// Pure (string in, array out) so it can be unit-tested in Node against real
// receipt OCR output. See /tmp harness or the project tests.

const uid = () =>
  (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `id-${Date.now()}-${Math.round(Math.random() * 1e9)}`);

// Multi-word phrases that mark totals/taxes/payment/metadata lines (safe to
// match as substrings — they won't collide with dish names).
const SKIP_PHRASES = [
  'sub total', 'sub-total', 'grand total', 'amount due', 'amt due', 'less vat', 'net of vat',
  'vat exempt', 'vat-exempt', 'vatable sales', 'zero rated', 'zero-rated',
  'service charge', 'svc charge', 'serv charge', 'service chrg', 'svc chrg', 'svc.chg',
  'sc/pwd', 'sc / pwd', 'solo parent', 'official receipt', 'sales inv', 'order #', 'order no',
  'order#', 'dine in', 'dine-in', 'take out', 'take-out', 'come again', 'qty item',
  'round off', 'round-off', 'thank you',
  'item(s)', 'number of item', 'no. of item', 'total due', 'total amount',
  // address / location lines (substrings — these don't appear in dish names)
  'street', 'avenue', 'boulevard', 'barangay', 'shopping center', 'bldg',
];

// Single tokens — matched on WORD BOUNDARIES so real dishes survive
// ("Tinola" keeps "tin", "Tipsy" keeps "tip", "Cumin" keeps "min").
const SKIP_WORDS = [
  'subtotal', 'total', 'tax', 'vat', 'vatable', 'discount', 'pwd', 'scpwd', 'senior', 'naac',
  'cash', 'change', 'tender', 'card', 'visa', 'mastercard', 'amex', 'gcash', 'maya', 'paymaya',
  'debit', 'credit', 'tip', 'gratuity', 'rounding', 'balance', 'receipt', 'invoice',
  'tin', 'trn', 'min', 'sn', 'bir', 'accr', 'permit', 'pos', 'or', 'snr', 'ctzn', 'items',
  'date', 'time', 'cashier', 'cshr', 'server', 'served', 'table', 'guest', 'pax',
  'particulars', 'description', 'salamat', 'welcome', 'tel', 'telephone', 'contact',
  'www', 'branch', 'reprint', 'void',
];
const SKIP_WORDS_RE = new RegExp(`\\b(${SKIP_WORDS.join('|')})\\b`, 'i');

// OCR-tolerant patterns for the metadata/total lines that thermal prints most
// often garble (V↔U, W↔H, O↔0, S↔5, I↔T). Without these, lines like
// "Sales PHD", "Less 12 UAT", "Appriode", "PHD ID" leak through as fake items.
const SKIP_PATTERNS = [
  /\b[vu]at(able)?\b/i,        // vat, uat, vatable, uatable
  /\bp[wh]d\b/i,               // pwd, phd
  /\bt[o0]tal\b/i,             // total, t0tal
  /\bsub\s*t[o0]tal\b/i,       // subtotal
  /\b[ch]+ange\b/i,            // change, hange (C dropped/garbled by OCR)
  /\bca[s5]h\b/i,              // cash, ca5h
  /\b(ave|blvd|brgy|cor|rd)\b/i, // address abbreviations
  /\b[ti]tems?\b/i,            // item, items, ttem
  /n[uo]nber/i,                // number, nunber (garbled)
  /\bappr/i,                   // approval / ApprCode (incl. "Appriode")
  /\bdisc(ount)?\b/i,          // disc, discount
  /\btender(ed)?\b|\btndrd?\b/i, // tender / tendered / tndrd — NOT "Tenders" the dish
  /\bzero[\s-]?rated\b/i,      // zero-rated
  /\bexe?mpt\b/i,              // exempt / exmpt
  /\bnet\s*(amount|amt|sales|total|of)\b/i, // net amount / net sales / net of vat
  /\bto\s*pay\b/i,             // amount to pay
  /am[o0]unt\s*[bd]ue/i,       // amount due / amount bue
  /\bamt\s*[bd]ue/i,           // amt due / amtbue
  /harge\b/i,                  // charge / service charge / stharge / sharge
  /\bs[.\s]*[i1][.\s0o]+no\b/i, // S.I. No / SI No / S10 No (invoice number)
];

// --- Fuzzy keyword layer ---------------------------------------------------
// Catches OCR garbles of metadata words we haven't hand-coded (e.g.
// "Sub7otal", "Custoner", "Vatab1e"). Deliberately conservative:
// only these curated keywords (≥6 chars, checked against common PH dish
// vocabulary), edit distance ≤1 for 6–7 chars and ≤2 for 8+, and only
// standalone word tokens. Notable non-members: "tender" (Chicken Tenders),
// "senior" ("Senor" brands), "cashier" ("Cashew" is distance 2).
const FUZZY_KEYWORDS = [
  'subtotal', 'discount', 'vatable', 'invoice', 'receipt', 'balance',
  'amount', 'number', 'change', 'charge', 'exempt', 'payment',
  'gratuity', 'transaction', 'terminal', 'customer', 'signature',
];

// Capped Levenshtein distance (bails out once > max).
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

// Normalize the digit-for-letter swaps OCR makes inside words, then test each
// word token against the fuzzy keyword list.
function hasFuzzyKeyword(lower) {
  const normalized = lower.replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e')
    .replace(/5/g, 's').replace(/7/g, 't').replace(/8/g, 'b');
  const tokens = normalized.match(/[a-z]{5,}/g);
  if (!tokens) return false;
  for (const token of tokens) {
    for (const kw of FUZZY_KEYWORDS) {
      const max = kw.length >= 8 ? 2 : 1;
      if (Math.abs(token.length - kw.length) <= max && editDistance(token, kw, max) <= max) return true;
    }
  }
  return false;
}

function isSkippableLine(lower) {
  return SKIP_PHRASES.some((p) => lower.includes(p))
    || SKIP_WORDS_RE.test(lower)
    || SKIP_PATTERNS.some((re) => re.test(lower))
    || hasFuzzyKeyword(lower);
}

// Peso "P" only counts as currency when it's a standalone token (so "Shrimp"
// and "Soup" keep their trailing p).
const CURRENCY = '(?:₱|php|piso|\\bp\\b|\\$)';

// Map characters Tesseract commonly confuses inside an otherwise-numeric token.
const fixDigits = (s) => s
  .replace(/[oO]/g, '0')
  .replace(/[lIi|!]/g, '1')
  .replace(/[Ss]/g, '5')
  .replace(/[B]/g, '8')
  .replace(/[Zz]/g, '2')
  .replace(/[,\s]/g, '');

// Trailing tax-class flags that follow an amount on PH receipts:
// V (VATable), E (VAT-exempt), Z (zero-rated), X/N (non-VAT), A, T/TX, and
// two-letter combos like "NV" (non-VAT) — plus a stray "*".
const TAXFLAG = '(?:\\s*(?:tx|vat|[veznxta]{1,2}))?\\s*\\*?';

// Find a money amount anchored at the END of the line (item amounts are
// right-aligned). Returns { raw, value, money } or null.
function detectTrailingAmount(line) {
  // 1) decimals win: "1,234.56", "P 95.00", "-45.00", "135.00V", "82.00 V"
  let m = line.match(new RegExp(`([-(]?\\s*${CURRENCY}?\\s*-?\\d[\\d.,]*\\.\\d{2})\\s*\\)?${TAXFLAG}\\s*$`, 'i'));
  if (m) return { raw: m[0], value: parseFloat(fixDigits(stripCurrency(m[1]))), money: true };
  // 2) currency symbol + whole number: "P 95", "₱120", "₱120V"
  m = line.match(new RegExp(`(${CURRENCY}\\s*-?\\d[\\d,]*)${TAXFLAG}\\s*$`, 'i'));
  if (m) return { raw: m[0], value: parseFloat(fixDigits(stripCurrency(m[1]))), money: true };
  // 3) bare trailing integer with a space before it: "Coke 50", "Coke 50V"
  m = line.match(new RegExp(`(\\s-?\\d[\\d,]{0,6})${TAXFLAG}\\s*$`, 'i'));
  if (m) return { raw: m[0], value: parseFloat(fixDigits(m[1])), money: false };
  // 4) fallback: amount followed by a short OCR "junk tail" from garbled
  //    columns — e.g. "Beef Stroganof 228 © 1 vy ey", "SALMON PS 645.00 /".
  //    Tight guards: boundary before the number, 1–4 tokens of ≤2 chars after,
  //    and a ₱20 floor so date/time fragments ("9.08 ay") can't qualify.
  m = line.match(/(?:^|[\s:])(\d[\d,]{0,6}(?:\.\d{2})?)((?:\s+\S{1,2}){1,4})\s*$/);
  if (m) {
    const value = parseFloat(fixDigits(m[1]));
    if (value >= 20 && !/^0\d/.test(m[1])) {
      return { raw: m[0], value, money: /\./.test(m[1]) };
    }
  }
  return null;
}

function stripCurrency(s) {
  return s.replace(/₱|php|piso|\$/ig, '').replace(/\bp\b/ig, '');
}

function cleanName(s) {
  return s
    .replace(/@\s*\d[\d.,]*/g, ' ')         // "@89" unit-price markers
    .replace(/₱|php|\$/ig, ' ')
    .replace(/[^A-Za-z0-9&'./\- ]/g, ' ')   // keep alnum + a few item-y punctuations
    .replace(/(\s+\d[\d.,]*)+\s*$/, '')      // unit-price/qty column residue ("… 329.00 1")
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s.\-:,*]+$/, '')             // trailing separators
    .replace(/^[\s.\-:,*]+/, '')             // leading separators
    .trim();
}

const MONTHS = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b/i;

// Date / time / phone / long-ID lines that sometimes end in digits but aren't items.
function looksLikeMetadata(line) {
  if (/\d{1,2}\s*[/.-]\s*\d{1,2}\s*[/.-]\s*\d{2,4}/.test(line)) return true; // 06/21/2026
  if (/\d{1,2}:\d{2}\s*(a\.?m\.?|p\.?m\.?)?/i.test(line)) return true;       // 7:42 PM
  if (/\d{3}[-\s]\d{3}[-\s]\d{3,}/.test(line)) return true;                  // TIN / phone
  if (/\(\d{2,4}\)\s*\d{3}/.test(line)) return true;                        // (415) 543-...
  if (MONTHS.test(line)) return true;                                       // "May 12, 2025"
  return false;
}

export function parseReceipt(text, selectedPeople = []) {
  return parseCore(text, selectedPeople).items;
}

// Items PLUS the shared adjustments printed on the receipt: service charge /
// tip lines as positive fees, PWD/senior/discount lines as negative fees —
// ready to prefill the app's fees list.
export function parseReceiptFull(text, selectedPeople = []) {
  const { items, fees } = parseCore(text, selectedPeople);
  return { items, fees };
}

// Quality score for OCR-orientation racing: decimal/currency-formatted amounts
// are strong evidence of a correctly-read receipt (2 pts) while bare integers
// are weak (1 pt) — so a rotation that reads real prices always beats one
// whose garbage happens to end in digits.
export function scoreReceiptText(text) {
  return parseCore(text, []).score;
}

// --- Fee/adjustment line detection ----------------------------------------
// "Sales PWD 301.50" is a sales-class subtotal, NOT a discount — so negative
// detection requires an explicit discount word, not just pwd/sc.
const FEE_NEGATIVE = /disc|\bsnr\b|\bctzn\b|\bsc\s*per\s*share/i;
const FEE_POSITIVE = /harge\b|harge\+|\bchrg\b|\btip\b|gratuity/i;
const FEE_EXCLUDE = /[vu]at|\btax\b|sales(?!\s*disc)/i;

function detectFeeLine(line, lower, amount) {
  if (!amount || !amount.money) return null;            // decimals required
  const value = amount.value;
  if (!Number.isFinite(value) || Math.abs(value) < 0.01 || Math.abs(value) > 99999) return null;
  if (FEE_EXCLUDE.test(lower)) return null;
  const neg = FEE_NEGATIVE.test(lower);
  const pos = FEE_POSITIVE.test(lower);
  if (!neg && !pos) return null;
  if (neg) {
    const name = /\bpwd\b/i.test(lower) ? 'PWD discount'
      : /\bsnr\b|\bctzn\b|senior/i.test(lower) ? 'Senior discount'
      : /\bsc\b/i.test(lower) ? 'SC discount' : 'Discount';
    return { name, amount: -Math.abs(value) };
  }
  const name = /\btip\b|gratuity/i.test(lower) ? 'Tip' : 'Service charge';
  return { name, amount: Math.abs(value) };
}

function parseCore(text, selectedPeople) {
  const items = [];
  const fees = [];
  let score = 0;
  let runningSum = 0;   // sum of item amounts so far
  let largestItem = 0;
  let summaryStarted = false;

  for (const rawLine of (text || '').split('\n')) {
    const line = rawLine.replace(/\t/g, ' ').trim();
    if (line.length < 3) continue;

    const amount = detectTrailingAmount(line);
    const lower = line.toLowerCase();

    // Structural boundary: a receipt's subtotal/total equals the sum of its
    // items. Once we hit a line whose amount matches the running item total
    // (and it's at least as large as any single item), everything below is the
    // summary block (subtotal, VAT, discounts, payment) — stop collecting
    // items but keep scanning it for fee/discount lines.
    if (amount && Number.isFinite(amount.value) && items.length >= 2
        && Math.abs(amount.value - runningSum) < 0.6 && amount.value >= largestItem - 0.01) {
      summaryStarted = true;
    }

    // Shared adjustments (service charge, PWD/senior discounts) live among
    // the skippable summary lines — capture them before skipping. Dedupe by
    // magnitude ("PWD Discount 46" + "Total Discount 46" print the same value).
    const fee = detectFeeLine(line, lower, amount);
    if (fee) {
      if (fees.length < 3 && !fees.some((f) => Math.abs(Math.abs(f.amount) - Math.abs(fee.amount)) < 0.01)) {
        fees.push({ id: uid(), ...fee, people: [...selectedPeople] });
      }
      continue;
    }

    if (summaryStarted) continue;
    if (isSkippableLine(lower)) continue;
    if (looksLikeMetadata(line)) continue;
    if (!amount) continue;

    const { value, money } = amount;
    if (!Number.isFinite(value) || value <= 0) continue;
    // Bare integers (no decimals / no currency symbol) must be a sane menu
    // price — this rejects ZIPs, check numbers, table numbers, years, etc.
    if (!money) {
      if (value < 10 || value > 9999) continue;
      if (/^\s*0\d/.test(amount.raw)) continue; // leading zero -> code/ID/ZIP, not a price
    }
    if (value > 100000) continue;

    const name = cleanName(line.slice(0, line.length - amount.raw.length));
    if (name.replace(/[^A-Za-z]/g, '').length < 2) continue; // needs a real name
    if (name.length > 48) continue;                          // probably a sentence, not an item

    const price = Math.round(value * 100) / 100;
    items.push({ id: uid(), name, price, people: [...selectedPeople] });
    score += money ? 2 : 1;
    runningSum += price;
    if (price > largestItem) largestItem = price;
  }
  return { items, fees, score };
}
