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

function isSkippableLine(lower) {
  return SKIP_PHRASES.some((p) => lower.includes(p)) || SKIP_WORDS_RE.test(lower);
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
// V (VATable), E (VAT-exempt), Z (zero-rated), X/N (non-VAT), T/TX, "*".
const TAXFLAG = '(?:\\s*(?:tx|vat|[veznxt]))?\\s*\\*?';

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
  if (m) return { raw: m[1], value: parseFloat(fixDigits(m[1])), money: false };
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
    .replace(/\s{2,}/g, ' ')
    .replace(/[\s.\-:,*]+$/, '')             // trailing separators
    .replace(/^[\s.\-:,*]+/, '')             // leading separators
    .trim();
}

// Date / time / phone / long-ID lines that sometimes end in digits but aren't items.
function looksLikeMetadata(line) {
  if (/\d{1,2}\s*[/.-]\s*\d{1,2}\s*[/.-]\s*\d{2,4}/.test(line)) return true; // 06/21/2026
  if (/\d{1,2}:\d{2}\s*(a\.?m\.?|p\.?m\.?)?/i.test(line)) return true;       // 7:42 PM
  if (/\d{3}[-\s]\d{3}[-\s]\d{3,}/.test(line)) return true;                  // TIN / phone
  if (/\(\d{2,4}\)\s*\d{3}/.test(line)) return true;                        // (415) 543-...
  return false;
}

export function parseReceipt(text, selectedPeople = []) {
  const items = [];
  for (const rawLine of (text || '').split('\n')) {
    const line = rawLine.replace(/\t/g, ' ').trim();
    if (line.length < 3) continue;

    const lower = line.toLowerCase();
    if (isSkippableLine(lower)) continue;
    if (looksLikeMetadata(line)) continue;

    const amount = detectTrailingAmount(line);
    if (!amount) continue;

    const { value, money } = amount;
    if (!Number.isFinite(value) || value <= 0) continue;
    // Bare integers (no decimals / no currency symbol) must be a sane menu
    // price — this rejects ZIPs, check numbers, table numbers, years, etc.
    if (!money && (value < 10 || value > 9999)) continue;
    if (value > 100000) continue;

    const name = cleanName(line.slice(0, line.length - amount.raw.length));
    if (name.replace(/[^A-Za-z]/g, '').length < 2) continue; // needs a real name
    if (name.length > 48) continue;                          // probably a sentence, not an item

    items.push({ id: uid(), name, price: Math.round(value * 100) / 100, people: [...selectedPeople] });
  }
  return items;
}
