// Everything money- or date-shaped goes through this file, so the currency
// sign and the date shapes exist in exactly one place.
//
// The currency is configurable, but this module stays pure and
// dependency-free: it imports nothing, reads no context and touches no
// storage. `stats.js`, `shareText.js` and their Node unit tests all import it
// directly, and the moment it reaches for React that property is gone.
//
// So it follows the same shape as `setOcrEnvironment` in `utils/ocr/env.js`:
// a module-level `configureCurrency()` the store calls, a sensible default so
// nothing is undefined before the store loads, lazily rebuilt Intl instances,
// and an explicit per-call override so a test can assert a currency without
// mutating anything global.

export const DEFAULT_CURRENCY = 'PHP';
export const DEFAULT_LOCALE = 'en-PH';

/** The locale the dates are written in. Money carries its own — see CURRENCIES. */
export const LOCALE = DEFAULT_LOCALE;

/**
 * The currencies offered in settings.
 *
 * Each carries the locale its figures should be written in, because placement
 * is not a property of the currency but of the locale reading it: EUR is
 * "1 234,50 €" in French and "€1,234.50" in Irish English. Picking the locale
 * here is what lets every formatter below stay free of manual symbol
 * concatenation.
 *
 * `fr-FR` rather than `de-DE` for the euro: both suffix the sign, but German
 * has no compact currency pattern, so a headline figure would render
 * "16.600 €" instead of "16,6 k €" and overflow a chart column.
 */
export const CURRENCIES = [
  { code: 'PHP', locale: 'en-PH', name: 'Philippine peso' },
  { code: 'USD', locale: 'en-US', name: 'US dollar' },
  { code: 'EUR', locale: 'fr-FR', name: 'Euro' },
  { code: 'JPY', locale: 'ja-JP', name: 'Japanese yen' },
  { code: 'SGD', locale: 'en-SG', name: 'Singapore dollar' },
  { code: 'GBP', locale: 'en-GB', name: 'Pound sterling' },
  { code: 'AUD', locale: 'en-AU', name: 'Australian dollar' },
  { code: 'CAD', locale: 'en-CA', name: 'Canadian dollar' },
  { code: 'HKD', locale: 'zh-HK', name: 'Hong Kong dollar' },
  { code: 'AED', locale: 'en-AE', name: 'UAE dirham' },
  { code: 'KRW', locale: 'ko-KR', name: 'South Korean won' },
  { code: 'THB', locale: 'th-TH', name: 'Thai baht' },
];

const DEFAULT_CONFIG = { code: DEFAULT_CURRENCY, locale: DEFAULT_LOCALE };

function entryFor(code) {
  return CURRENCIES.find((c) => c.code === code) || null;
}

/** Normalises anything a caller or a restored backup might hand us. */
function resolveConfig(next) {
  if (!next) return DEFAULT_CONFIG;
  const raw = typeof next === 'string' ? { code: next } : next;
  const entry = entryFor(raw.code);
  if (!entry) return { ...DEFAULT_CONFIG, ...(raw.locale ? { locale: raw.locale } : {}) };
  return { code: entry.code, locale: raw.locale || entry.locale };
}

function build({ code, locale }, options) {
  const opts = { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol', ...options };
  try {
    return new Intl.NumberFormat(locale, opts);
  } catch {
    // An unknown locale, or an engine without `narrowSymbol`. Neither is worth
    // a blank screen in a bill splitter.
    try {
      return new Intl.NumberFormat(locale, { ...opts, currencyDisplay: 'symbol' });
    } catch {
      return new Intl.NumberFormat(DEFAULT_LOCALE, { ...options, style: 'currency', currency: DEFAULT_CURRENCY });
    }
  }
}

function makeFormatters(config) {
  const full = build(config, {});
  return {
    full,
    // The same formatter with the minor units switched off, for amounts that
    // have none — and the only formatter a zero-decimal currency ever needs.
    whole: build(config, { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
    // `trailingZeroDisplay` is load-bearing, not tidiness. Without it the
    // same amount renders ₱1K on one ICU build and ₱1.0K on another — macOS
    // and the linux CI runner genuinely disagree about en-PH compact notation
    // — so the figure on a user's screen depended on their platform. Stripping
    // an integer's decimal makes it the same everywhere.
    compact: build(config, {
      notation: 'compact',
      maximumFractionDigits: 1,
      trailingZeroDisplay: 'stripIfInteger',
    }),
    // 2 for the peso, 0 for the yen. Everything that "trims decimals" asks
    // the formatter how many there are rather than assuming two.
    digits: full.resolvedOptions().maximumFractionDigits ?? 2,
  };
}

function symbolOf(nf) {
  const part = nf.formatToParts(0).find((p) => p.type === 'currency');
  return part ? part.value : '';
}

let config = DEFAULT_CONFIG;
let formatters = null;

/** The active currency's sign. Exported as a live binding — see PESO below. */
export let CURRENCY_SYMBOL = '₱';

/**
 * Kept under its old name because the wizard's price fields print it as a
 * standalone input prefix. It is the ACTIVE currency's sign, not the peso's,
 * and `CURRENCY_SYMBOL` is the name to reach for in new code.
 */
export let PESO = '₱';

function active() {
  if (!formatters) {
    formatters = makeFormatters(config);
    CURRENCY_SYMBOL = symbolOf(formatters.full);
    PESO = CURRENCY_SYMBOL;
  }
  return formatters;
}

/**
 * Points every money formatter at a currency. Call with nothing to go back to
 * the default, the way `setOcrEnvironment()` restores the browser backend.
 *
 * An unknown or malformed code falls back to PHP rather than throwing, so a
 * backup written before this setting existed restores cleanly.
 *
 * Returns the code actually applied, which is what the store should persist.
 */
export function configureCurrency(next) {
  config = resolveConfig(next);
  formatters = null;
  active();
  return config.code;
}

/** The code in force right now. */
export function currentCurrency() {
  return config.code;
}

/** `formatCurrency(5, 'JPY')` without touching the module's own setting. */
function pick(override) {
  if (!override) return active();
  return makeFormatters(resolveConfig(override));
}

/** The sign a currency prints, for labelling the choice in settings. */
export function symbolFor(code) {
  return symbolOf(pick(code).full);
}

export function formatCurrency(amount, override) {
  const n = Number.isFinite(amount) ? amount : 0;
  return pick(override).full.format(n);
}

/**
 * ₱575, not ₱575.00 — but ₱575.50 keeps its centavos.
 *
 * Chat messages read better without trailing zeroes. This used to be done by
 * slicing ".00" off the end of a formatted string, which is currency logic
 * living in the wrong file and written against the formatter's current output.
 *
 * The minor unit is whatever the formatter says it is, so this is a no-op for
 * a zero-decimal currency: ¥500 was never ¥500.00 to begin with.
 */
export function formatCurrencyTrim(amount, override) {
  const n = Number.isFinite(amount) ? amount : 0;
  const f = pick(override);
  if (f.digits === 0) return f.full.format(n);
  const factor = 10 ** f.digits;
  const minor = Math.round(n * factor);
  const exact = minor / factor;
  return minor % factor === 0 ? f.whole.format(exact) : f.full.format(exact);
}

/**
 * "Aug 12", or "Aug 12, 2025" once the year stops being obvious. Short enough
 * to sit in parentheses next to a split's name.
 */
export function formatShortDate(iso, { now = Date.now() } = {}) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString(LOCALE, sameYear
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "Jan" — the month-column label on the stats chart. */
export function formatMonthShort(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(LOCALE, { month: 'short' });
}

// Compact form for headline figures, e.g. ₱12.3K — keeps balances from
// overflowing fixed-width cards and chart columns on small phones.
//
// Centavos are dropped at EVERY size, not only above ₱1,000. Falling through
// to the full formatter under a thousand produced "₱480.00" in a 37px chart
// column, which overflowed it and collided with the next month — and two
// decimals are noise in a figure that is already rounded to one significant
// place above it. Exact amounts use formatCurrency; this is for glanceable
// ones.
//
// The sign is placed by Intl, not pasted on the front. Concatenating it put
// the mark on the wrong side of every suffixing currency ("€1 234,56") and on
// the wrong side of the minus sign in every currency ("₱-480").
export function formatCompact(amount, override) {
  const n = Number.isFinite(amount) ? amount : 0;
  const f = pick(override);
  return Math.abs(n) >= 1000 ? f.compact.format(n) : f.whole.format(n);
}

export function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(LOCALE, { month: 'short', day: 'numeric', year: 'numeric' });
}

// "Today", "Yesterday", or a short date — friendlier for a recent-bills feed.
export function formatRelativeDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((startOfToday - startOfDate) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays > 1 && diffDays < 7) return `${diffDays} days ago`;
  return formatDate(iso);
}

/**
 * The same distance, said mid-sentence: "today", "yesterday", "9 days ago",
 * or "on Aug 12" once a day count stops being a number anyone holds in their
 * head. Lower case and prefixless, so a caller supplies the verb — "Reminded
 * 9 days ago" reads as a sentence and "Reminded 9 Days Ago" does not.
 *
 * Counted in calendar days rather than elapsed hours, like formatRelativeDate
 * above: a message sent at 11pm was sent yesterday, not ten hours ago. It
 * takes a timestamp or a date string, and `now` so a test can pin it.
 */
export function formatAgo(value, { now = Date.now() } = {}) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const ref = new Date(now);
  const startOfNow = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const startOfThen = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((startOfNow - startOfThen) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return `on ${formatShortDate(d.toISOString(), { now })}`;
}

export function initialsOf(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}
