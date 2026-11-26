import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatCompact, formatCurrency, formatCurrencyTrim, formatShortDate, formatMonthShort,
  configureCurrency, currentCurrency, symbolFor, CURRENCIES, DEFAULT_CURRENCY, PESO,
} from './format.js';

// Every test that mutates the module's currency puts it back. The default is
// the one thing the rest of the suite — and the app's first paint — assumes.
test.afterEach(() => configureCurrency());

test('exact amounts keep their centavos', () => {
  assert.equal(formatCurrency(480), '₱480.00');
  assert.equal(formatCurrency(1234.5), '₱1,234.50');
});

test('compact amounts drop centavos below a thousand too', () => {
  // The regression this guards: "₱480.00" is 52px at 12px type, which does
  // not fit a 37px chart column on a 320px phone.
  assert.equal(formatCompact(480), '₱480');
  assert.equal(formatCompact(0), '₱0');
  assert.equal(formatCompact(999), '₱999');
});

test('compact amounts stay compact above a thousand', () => {
  assert.equal(formatCompact(1000), '₱1K');
  assert.equal(formatCompact(16600), '₱16.6K');
});

test('a negative balance compacts without losing its sign', () => {
  // The sign sits where the locale puts it. Pasting "₱" on the front used to
  // produce "₱-480", which no formatter anywhere writes.
  assert.equal(formatCompact(-480), '-₱480');
});

test('a non-numeric amount is zero, not NaN on screen', () => {
  assert.equal(formatCompact(undefined), '₱0');
  assert.equal(formatCompact(NaN), '₱0');
  assert.equal(formatCurrency('nonsense'), '₱0.00');
});

// --- One place for the currency sign and the en-PH date shapes ---

test('formatCurrencyTrim drops centavos only when there are none', () => {
  assert.equal(formatCurrencyTrim(575), '₱575');
  assert.equal(formatCurrencyTrim(1005), '₱1,005');
  assert.equal(formatCurrencyTrim(575.5), '₱575.50');
  assert.equal(formatCurrencyTrim(3.33), '₱3.33');
  assert.equal(formatCurrencyTrim(0), '₱0');
});

test('formatCurrencyTrim agrees with formatCurrency on the centavos', () => {
  // The old version sliced ".00" off the formatted string, which is the kind
  // of currency logic that quietly breaks the moment the format changes.
  assert.equal(formatCurrencyTrim(575.5), formatCurrency(575.5));
  assert.equal(formatCurrencyTrim(1234.56), formatCurrency(1234.56));
});

test('formatCurrencyTrim survives junk', () => {
  assert.equal(formatCurrencyTrim(undefined), '₱0');
  assert.equal(formatCurrencyTrim(NaN), '₱0');
});

test('formatShortDate leaves the year off when it is this year', () => {
  const now = new Date(2026, 7, 20).getTime();
  assert.equal(formatShortDate('2026-08-12T00:00:00', { now }), 'Aug 12');
  assert.equal(formatShortDate('2025-08-12T00:00:00', { now }), 'Aug 12, 2025');
});

test('formatShortDate returns an empty string for an unreadable date', () => {
  assert.equal(formatShortDate('nonsense'), '');
  assert.equal(formatShortDate(undefined), '');
});

test('formatMonthShort names the month', () => {
  assert.equal(formatMonthShort(new Date(2026, 0, 15)), 'Jan');
  assert.equal(formatMonthShort(new Date(2026, 11, 1)), 'Dec');
});

test('PESO is the active currency sign, and it starts as the peso', () => {
  assert.equal(PESO, '₱');
  assert.ok(formatCurrency(1).startsWith(PESO));
});

// --- Currency as a setting -----------------------------------------------

test('the currency defaults to the peso before anything configures it', () => {
  assert.equal(currentCurrency(), DEFAULT_CURRENCY);
  assert.equal(DEFAULT_CURRENCY, 'PHP');
  assert.equal(CURRENCIES[0].code, 'PHP');
});

test('configuring a currency changes every money formatter', () => {
  configureCurrency('USD');
  assert.equal(currentCurrency(), 'USD');
  assert.equal(formatCurrency(1234.5), '$1,234.50');
  assert.equal(formatCurrencyTrim(575), '$575');
  assert.equal(formatCurrencyTrim(575.5), '$575.50');
  assert.equal(formatCompact(16600), '$16.6K');
});

test('configuring with nothing puts the peso back', () => {
  configureCurrency('USD');
  configureCurrency();
  assert.equal(currentCurrency(), 'PHP');
  assert.equal(formatCurrency(480), '₱480.00');
});

test('a suffixing currency puts its sign after the figure', () => {
  // The trap the old formatCompact fell into: it pasted the sign on the front
  // of every amount, which is simply wrong for a currency Intl suffixes.
  configureCurrency('EUR');
  const full = formatCurrency(1234.56);
  assert.ok(full.endsWith('€'), `expected a trailing euro sign, got ${full}`);
  assert.ok(!full.startsWith('€'), `the sign should not be pasted in front: ${full}`);
  assert.ok(full.includes('1') && full.includes('234'), full);
  assert.ok(formatCompact(16600).trimEnd().endsWith('€'), formatCompact(16600));
  assert.ok(formatCurrencyTrim(575).trimEnd().endsWith('€'), formatCurrencyTrim(575));
});

test('a zero-decimal currency never grows decimals', () => {
  configureCurrency('JPY');
  for (const out of [formatCurrency(500), formatCurrencyTrim(500), formatCompact(500)]) {
    assert.ok(!out.includes('.00'), `a yen amount should have no minor units: ${out}`);
    assert.ok(out.includes('500'), out);
  }
  // "Trim" is a no-op here, so a fractional yen rounds rather than exposing
  // decimals the currency does not have.
  assert.equal(formatCurrencyTrim(500), formatCurrency(500));
  assert.ok(!formatCurrencyTrim(500.4).includes('.'), formatCurrencyTrim(500.4));
});

test('an explicit override formats without touching the module setting', () => {
  assert.equal(formatCurrency(1234.5, 'USD'), '$1,234.50');
  assert.equal(formatCurrencyTrim(575, 'JPY'), formatCurrency(575, 'JPY'));
  // ...and the app is still in pesos afterwards.
  assert.equal(currentCurrency(), 'PHP');
  assert.equal(formatCurrency(480), '₱480.00');
});

test('every offered currency formats, and has a sign to label it with', () => {
  for (const c of CURRENCIES) {
    assert.equal(configureCurrency(c.code), c.code, c.code);
    const out = formatCurrency(1234.5);
    assert.ok(out.length > 0 && !out.includes('NaN'), `${c.code}: ${out}`);
    assert.ok(symbolFor(c.code).length > 0, `${c.code} has no sign`);
    assert.ok(c.name.length > 0, `${c.code} has no name`);
  }
});

test('a backup written before this setting falls back to the peso', () => {
  // Schema drift: version-2 backups carry no `currency` key at all, and a
  // hand-edited one can carry anything. None of it may throw, and none of it
  // may reach the screen as "undefined480".
  for (const stored of [undefined, null, '', 'XYZ', 'php', 42, {}, { code: 'XYZ' }]) {
    assert.equal(configureCurrency(stored), 'PHP', String(stored));
    assert.equal(formatCurrency(480), '₱480.00');
    assert.equal(formatCompact(480), '₱480');
  }
});
