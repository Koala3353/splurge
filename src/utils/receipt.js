// Receipt OCR text -> line items, tuned for Philippine restaurant receipts.
// Pure (string in, array out) so it can be unit-tested in Node against real
// receipt OCR output. Scored against CORD-v2 by `npm run ocr-eval`.

import { uid } from './id.js';

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
  /\b(vat|val|vaт)\s*reg\b/i,  // VAT REG (TIN) — incl. garbled "VAL REG"
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

// The summary block's own labels, garbled. "TOVAL", "lotal", "Totals",
// "CRANDTOTAL" and "ASH" all reached the item list on real photos, each
// carrying the bill's total as if it were the price of a dish. These are
// SHORT words, so the ≥5-char fuzzy pass above cannot see them, and matching
// them loosely would eat real dish names — so the rule is deliberately tight:
// the garble must be essentially the whole label (one or two tokens), and
// within one edit of the keyword.
const SUMMARY_LABELS = ['total', 'grandtotal', 'cash', 'change', 'charge', 'balance'];

function looksLikeSummaryLabel(name) {
  const normalized = name.toLowerCase()
    .replace(/0/g, 'o').replace(/1/g, 'l').replace(/5/g, 's').replace(/7/g, 't');
  const tokens = normalized.match(/[a-z]{3,}/g);
  if (!tokens || tokens.length > 2) return false;
  for (const token of tokens) {
    for (const kw of SUMMARY_LABELS) {
      if (Math.abs(token.length - kw.length) > 1) continue;
      if (editDistance(token, kw, 1) <= 1) return true;
      // "grandtotal" / "subtotal" arrive glued to a neighbour ("gus Toa A").
      if (kw.length >= 8 && token.includes(kw.slice(0, 5))) return true;
    }
  }
  return false;
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
export function detectTrailingAmount(line) {
  // OCR sometimes reads the decimal point as a comma ("82,00 V"). Normalize
  // comma + exactly-two-digits to a dot when not followed by more digits
  // (which would be a thousands separator). Same length, so downstream
  // slice-by-length name extraction stays aligned.
  line = line.replace(/,(\d{2})(?=[^\d.,]|$)/g, '.$1');
  // 1) decimals win: "1,234.56", "P 95.00", "-45.00", "135.00V", "82.00 V"
  let m = line.match(new RegExp(`([-(]?\\s*${CURRENCY}?\\s*-?\\d[\\d.,]*\\.\\d{2})\\s*\\)?${TAXFLAG}\\s*$`, 'i'));
  if (m) return { raw: m[0], value: parseFloat(fixDigits(stripCurrency(m[1]))), money: true };
  // 2) currency symbol + whole number: "P 95", "₱120", "₱120V"
  m = line.match(new RegExp(`(${CURRENCY}\\s*-?\\d[\\d,]*)${TAXFLAG}\\s*$`, 'i'));
  if (m) return { raw: m[0], value: parseFloat(fixDigits(stripCurrency(m[1]))), money: true };
  // 2b) thousands-grouped whole amount: "12,500", "1,250,000" — and, because
  //     plenty of the world groups with dots, "12.500" too. Grouping is as
  //     strong a signal of a price column as a ".00" tail is, and treating it
  //     as a bare integer was costing real items: the bare path caps values at
  //     9,999, so every five-figure amount was silently discarded. Measured on
  //     CORD-v2, this is the single largest recall win in the parser.
  m = line.match(new RegExp(`(${CURRENCY}?\\s*-?\\d{1,3}(?:[.,]\\d{3})+)${TAXFLAG}\\s*$`, 'i'));
  if (m) {
    const digits = stripCurrency(m[1]).replace(/[.,\s]/g, '');
    const value = parseFloat(fixDigits(digits));
    if (Number.isFinite(value)) return { raw: m[0], value, money: true };
  }
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

// --- Layout: the price column ---------------------------------------------
// Receipts differ wildly in what they print, but almost all of them share one
// structure: amounts are RIGHT-ALIGNED in a column of their own, separated
// from the item name by a wide run of spaces. Finding that column (or proving
// it does not exist) is worth more than any per-line heuristic, because it
// turns an ambiguous trailing number into a positionally-attested price.
//
// Why this matters concretely: the bare-integer path caps values at 9,999 to
// reject ZIP codes, table numbers and order IDs — numbers that appear in the
// middle of a line, not in a column. A number that lines up with four other
// amounts on the page is not a table number, so the cap can be lifted for it
// without reopening that hole. Measured on CORD-v2, undecimalised column
// prices above the cap were the single largest remaining recall loss.

// Where the amount's LAST digit sits in the line. Right-alignment is the
// invariant a price column actually has, and the last digit's position is the
// only part of the match that survives the differences between the patterns
// in detectTrailingAmount and the OCR junk that trails a garbled column.
function amountEnd(line, amount) {
  const at = line.length - amount.raw.length;
  let last = -1;
  for (let i = amount.raw.length - 1; i >= 0; i--) {
    if (amount.raw.charCodeAt(i) >= 48 && amount.raw.charCodeAt(i) <= 57) { last = i; break; }
  }
  return last < 0 ? -1 : at + last;
}

/** Where the amount's first digit sits — used to measure the gutter. */
function firstDigit(line, amount) {
  const at = line.length - amount.raw.length;
  const m = /\d/.exec(amount.raw);
  return m ? at + m.index : line.length;
}

const COLUMN_TOLERANCE = 4;   // chars of wobble allowed within one column
const COLUMN_MIN_ROWS = 3;    // fewer than this is coincidence, not a column
const COLUMN_MIN_GAP = 2;     // spaces between name and amount

/**
 * Decide whether these lines share a right-aligned amount column, and if so
 * which of them sit in it.
 *
 * @param {string[]} lines
 * @param {Array<object|null>} amounts  detectTrailingAmount per line
 * @returns {Set<number>} indices of lines whose amount is column-attested
 */
export function detectPriceColumn(lines, amounts) {
  const entries = [];
  for (let i = 0; i < lines.length; i++) {
    const a = amounts[i];
    if (!a || !Number.isFinite(a.value)) continue;
    const end = amountEnd(lines[i], a);
    const first = firstDigit(lines[i], a);
    if (end < 0) continue;
    // A column is defined by the gutter in front of it. Without one, the
    // number is just the tail of a sentence.
    const before = lines[i].slice(0, first);
    if (!new RegExp(`\\s{${COLUMN_MIN_GAP},}$`).test(before)) continue;
    // Needs something to its left, or it is a lone number, not a priced row.
    if (before.replace(/[^A-Za-z0-9]/g, '').length < 2) continue;
    entries.push({ i, start: end });
  }
  if (entries.length < COLUMN_MIN_ROWS) return new Set();

  // Largest cluster of start positions. Receipts sometimes print a quantity
  // column too, so take the RIGHTMOST cluster that is big enough — amounts
  // are the last column on the line.
  let best = null;
  for (const anchor of entries) {
    const members = entries.filter((e) => Math.abs(e.start - anchor.start) <= COLUMN_TOLERANCE);
    if (members.length < COLUMN_MIN_ROWS) continue;
    if (!best || members.length > best.members.length
      || (members.length === best.members.length && anchor.start > best.start)) {
      best = { start: anchor.start, members };
    }
  }
  return best ? new Set(best.members.map((m) => m.i)) : new Set();
}

// Some receipts don't put the amount beside the name at all: the name takes a
// full-width line and the money is printed underneath, usually with a quantity
// breakdown ("CINNAMON SUGAR" / "1 x 17.000      17,000"). A line that carries
// an amount and nothing else nameable is that continuation, not an item of its
// own — short alpha tokens are currency marks and OCR crumbs, not names.
export function isAmountOnlyLine(line, amount) {
  const head = line.slice(0, line.length - amount.raw.length);
  const stripped = head
    .replace(/₱|\$/g, ' ')
    .replace(/\d[\d.,]*/g, ' ')
    .replace(/\b[A-Za-z]{1,2}\b/g, ' ');
  return stripped.replace(/[^A-Za-z]/g, '').length < 3;
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
    // Leading quantity column: "2 Chicken Adobo", "3x Rice". The unit guard
    // keeps real menu names like "2 pc Chickenjoy" intact.
    .replace(/^\d{1,3}\s*[xX*]?\s+(?!(?:pc|pcs|pk|pack|pax|kg|g|ml|l|oz)\b)(?=[A-Za-z]{3,})/i, '')
    // Speckle picked up from the receipt edge or the table behind it lands as
    // a stray token in front of the name ("n Halo Halo", "bl Pecho Solo").
    // Only single letters and vowel-less pairs are dropped, so genuine short
    // words survive — "Ox Tail", "La Paz" and "Mi Goreng" all keep their heads.
    .replace(/^(?:(?:[A-Za-z]|[B-DF-HJ-NP-TV-Zb-df-hj-np-tv-z]{2})\s+){1,2}(?=[A-Za-z]{3,})/, '')
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

// Quality rating for OCR candidate racing. Decimal/currency-formatted item
// amounts and recognized fee lines are strong evidence of a correctly-read
// receipt; bare trailing integers are weak evidence (background noise on a
// busy surface often produces name-plus-integer garbage), so callers should
// cap their influence rather than let them outvote a clean read.
export function rateReceiptText(text) {
  const { items, fees, moneyCount } = parseCore(text, []);
  return { money: moneyCount, bare: items.length - moneyCount, fees: fees.length };
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
  let moneyCount = 0;   // items whose amount was decimal/currency-formatted
  let runningSum = 0;   // sum of item amounts so far
  let largestItem = 0;
  let summaryStarted = false;

  // Left indentation is kept: a right-aligned amount column can only be seen
  // if every line is measured from the same origin. cleanName() strips the
  // leading whitespace again when it extracts the item name.
  const lines = (text || '').split('\n')
    .map((l) => l.replace(/\t/g, ' ').replace(/\s+$/, ''))
    .map((l) => (l.trim().length >= 3 ? l : ''));
  const amounts = lines.map((l) => (l ? detectTrailingAmount(l) : null));
  const inColumn = detectPriceColumn(lines, amounts);
  const consumed = new Set();   // lines absorbed as a previous line's amount

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    if (!line) continue;

    const amount = amounts[li];
    const columnPriced = inColumn.has(li);
    const lower = line.toLowerCase();

    // Structural boundary: a receipt's subtotal/total equals the sum of its
    // items. Once we hit a line whose amount matches the running item total
    // (and it's at least as large as any single item), everything below is the
    // summary block (subtotal, VAT, discounts, payment) — stop collecting
    // items but keep scanning it for fee/discount lines.
    if (amount && Number.isFinite(amount.value) && items.length >= 2
        && Math.abs(amount.value - runningSum) < 0.6 && amount.value >= largestItem - 0.01) {
      // Matching the running sum is suggestive, not proof: the third item on a
      // receipt of 100 + 100 + 200 hits it by coincidence. A real subtotal
      // either names itself ("Subtotal", "Total", or an OCR garble of one) or
      // carries no name at all, so a line with a genuine dish name is left
      // alone. Erring this way is deliberate — a stray extra row is visible and
      // deletable, whereas silently dropping the rest of the receipt is not.
      const label = cleanName(line.slice(0, line.length - amount.raw.length));
      const looksLikeAnItem = label.replace(/[^A-Za-z]/g, '').length >= 3
        && !isSkippableLine(lower);
      if (!looksLikeAnItem) summaryStarted = true;
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
    if (consumed.has(li)) continue;
    if (isSkippableLine(lower)) continue;
    if (looksLikeMetadata(line)) continue;

    // Layout: name on its own line, money on the next one.
    let priced = amount;
    let pricedInColumn = columnPriced;
    let nameText = amount ? line.slice(0, line.length - amount.raw.length) : line;
    if (!amount && line.replace(/[^A-Za-z]/g, '').length >= 3) {
      const j = li + 1;
      const next = lines[j];
      const nextAmount = amounts[j];
      if (next && nextAmount && isAmountOnlyLine(next, nextAmount)
        && !isSkippableLine(next.toLowerCase()) && !looksLikeMetadata(next)) {
        priced = nextAmount;
        pricedInColumn = inColumn.has(j);
        nameText = line;
        consumed.add(j);
      }
    }
    if (!priced) continue;

    const { value, money } = priced;
    if (!Number.isFinite(value) || value <= 0) continue;
    // Bare integers (no decimals / no currency symbol) must be a sane menu
    // price — this rejects ZIPs, check numbers, table numbers, years, etc.
    if (!money) {
      // A number that lines up with the rest of the page's amounts is a price
      // wherever it falls; one that doesn't has to be a plausible menu price,
      // which is what keeps ZIPs, table numbers and order IDs out.
      if (value < 10) continue;
      if (!pricedInColumn && value > 9999) continue;
      if (/^\s*0\d/.test(priced.raw)) continue; // leading zero -> code/ID/ZIP, not a price
    }
    if (value > 100000) continue;

    const name = cleanName(nameText);
    if (name.replace(/[^A-Za-z]/g, '').length < 3) continue; // needs a real name
    if (name.length > 48) continue;                          // probably a sentence, not an item
    // A garbled "TOTAL" carrying the bill's total is the most expensive kind
    // of wrong row: it looks like an item and it is the largest number there.
    if (looksLikeSummaryLabel(name)) { summaryStarted = true; continue; }

    const price = Math.round(value * 100) / 100;
    items.push({ id: uid(), name, price, people: [...selectedPeople] });
    if (money) moneyCount += 1;
    runningSum += price;
    if (price > largestItem) largestItem = price;
  }
  return { items, fees, moneyCount };
}
