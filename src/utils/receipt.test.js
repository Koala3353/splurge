// Parser regression suite. receipt.js is deliberately pure (string in, array
// out), so every layout quirk a real PH receipt throws at us can be pinned
// here without an image or a browser. Run: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReceipt, parseReceiptFull } from './receipt.js';

const names = (txt) => parseReceipt(txt).map((i) => i.name);
const prices = (txt) => parseReceipt(txt).map((i) => i.price);
const sum = (txt) => prices(txt).reduce((a, b) => a + b, 0);

test('reads a plain receipt and stops at the subtotal', () => {
  const r = `MANG INASAL
Pecho             189.00
Palabok           129.00
Halo Halo          89.00
Subtotal          407.00
Total             407.00`;
  assert.deepEqual(names(r), ['Pecho', 'Palabok', 'Halo Halo']);
  assert.equal(sum(r), 407);
});

// Regression: the summary-detection heuristic used to fire on any line whose
// amount happened to equal the running total, so a legitimately-priced item
// silently truncated the rest of the receipt. Losing items is far worse than
// keeping a stray one — the user can delete what they can see, but cannot
// discover what was never shown.
test('an item priced at the running total does not truncate the receipt', () => {
  const r = `Chicken Joy      100.00
Jolly Spaghetti  100.00
Burger Steak     200.00
Peach Mango Pie  150.00
Iced Tea          80.00
Total            630.00`;
  assert.equal(parseReceipt(r).length, 5, 'all five items survive');
  assert.equal(sum(r), 630);
});

test('still stops at a subtotal whose keyword OCR garbled', () => {
  const r = `Sisig            250.00
Crispy Pata      450.00
Sub7ota1         700.00
Cash            1000.00`;
  assert.deepEqual(names(r), ['Sisig', 'Crispy Pata']);
});

test('strips the quantity column from item names', () => {
  const r = `2  Chicken Adobo     360.00
1  Sinigang Baboy    280.00
3x Rice               45.00`;
  assert.deepEqual(names(r), ['Chicken Adobo', 'Sinigang Baboy', 'Rice']);
});

test('keeps qty x unit-price columns out of the name and takes the line total', () => {
  const r = `Chicken Inasal    2   180.00   360.00
Halo-Halo         1   120.00   120.00`;
  assert.deepEqual(names(r), ['Chicken Inasal', 'Halo-Halo']);
  assert.deepEqual(prices(r), [360, 120]);
});

test('captures service charge and discounts as fees, not items', () => {
  const r = `Sisig            250.00
Rice              50.00
Service Charge    30.00
PWD Discount      45.00
Total            285.00`;
  const { items, fees } = parseReceiptFull(r);
  assert.deepEqual(items.map((i) => i.name), ['Sisig', 'Rice']);
  assert.equal(fees.find((f) => f.amount > 0)?.amount, 30);
  assert.ok(fees.some((f) => f.amount === -45), 'discount is negative');
});

test('ignores dates, phone numbers and TIN lines that end in digits', () => {
  const r = `Tapa Silog       180.00
06/21/2026  7:42 PM
TIN 123-456-789
Tel 8123 4567
Longganisa       165.00`;
  assert.deepEqual(names(r), ['Tapa Silog', 'Longganisa']);
});

test('dish names that contain skip-words survive', () => {
  const r = `Chicken Tenders   240.00
Tinolang Manok    195.00
Tipsy Shrimp      310.00`;
  assert.equal(parseReceipt(r).length, 3);
});

test('drops OCR speckle in front of a name but keeps real short words', () => {
  const r = `n Halo Halo        89.00
bl Pecho Solo     189.00
Ox Tail Kare-Kare 420.00
La Paz Batchoy    180.00`;
  assert.deepEqual(names(r), ['Halo Halo', 'Pecho Solo', 'Ox Tail Kare-Kare', 'La Paz Batchoy']);
});

test('five-figure prices survive the thousands separator', () => {
  // The bare-integer path caps values at 9,999 to reject ZIPs and table
  // numbers, so a grouped amount used to be thrown away with them. Grouping
  // IS the evidence that it is a price.
  const r = `Lechon Belly      12,500
Whole Lapu-Lapu    8,750
Crispy Pata       15,000`;
  assert.deepEqual(parseReceipt(r).map((i) => i.price), [12500, 8750, 15000]);
});

test('reads dot-grouped amounts as whole numbers, not decimals', () => {
  // Plenty of currencies group with a dot. Reading "24.000" as twenty-four
  // pesos put the wrong number on the item; reading it as a grouped whole
  // number at least puts the printed digits there. (Amounts above ₱100,000
  // are still rejected as implausible for a restaurant line item.)
  const r = `ES TEH MANIS      24.000
NASI GORENG       35.000`;
  assert.deepEqual(parseReceipt(r).map((i) => i.price), [24000, 35000]);
});

test('a two-decimal price is still read as a decimal, not as grouping', () => {
  const r = `Iced Latte       155.00
Pandesal           5.50`;
  assert.deepEqual(parseReceipt(r).map((i) => i.price), [155, 5.5]);
});

test('a grouped amount on a metadata line is still not an item', () => {
  const r = `Sinigang na Baboy  420.00
TIN 123.456.789
Grand Total      12,500`;
  assert.deepEqual(parseReceipt(r).map((i) => i.name), ['Sinigang na Baboy']);
});

// --- layout: the price column ---------------------------------------------

test('a right-aligned column makes five-figure bare integers prices', () => {
  // Undecimalised, ungrouped amounts printed in a column. Each one alone
  // looks like an order number; four of them lining up do not.
  const r = `J.STB PROMO       17500
Y.B.BAT           46000
Y.BASO PROM       27500
KOPI SUSU          9500`;
  assert.deepEqual(parseReceipt(r).map((i) => i.price), [17500, 46000, 27500, 9500]);
});

test('without a column, a five-figure bare integer is still rejected', () => {
  // The cap exists to reject ZIPs, table numbers and order IDs. Lifting it
  // only inside a detected column is what keeps that protection.
  const r = `Table 17500
Adobo 250.00`;
  assert.deepEqual(parseReceipt(r).map((i) => i.name), ['Adobo']);
});

test('the column is the rightmost one, not the quantity column', () => {
  const r = `Sisig           2        240.00
Kare Kare       1        380.00
Lumpia          3        150.00`;
  assert.deepEqual(parseReceipt(r).map((i) => i.price), [240, 380, 150]);
});

// --- layout: the amount on the next line ----------------------------------

test('an item whose amount is printed on the following line is kept', () => {
  const r = `CINNAMON SUGAR
1 x 17.000            17,000
CHOCO BREAD
2 x 12.000            24,000`;
  const items = parseReceipt(r);
  assert.deepEqual(items.map((i) => i.name), ['CINNAMON SUGAR', 'CHOCO BREAD']);
  assert.deepEqual(items.map((i) => i.price), [17000, 24000]);
});

test('a following line that names something is NOT absorbed as an amount', () => {
  const r = `Cheese Croquette
Plastik Amook      1       25.00`;
  // The second line is an item in its own right, so the first stays unpriced.
  assert.deepEqual(parseReceipt(r).map((i) => i.name), ['Plastik Amook']);
});

// --- garbled summary labels ------------------------------------------------

test('OCR garbles of TOTAL and CASH do not become items', () => {
  // Every one of these reached the item list on a real photo, each carrying
  // the bill's total as if it were the price of a dish.
  for (const label of ['TOVAL', 'lotal', 'Totals', 'ASH', 'Chanqe']) {
    const r = `Sinigang na Baboy   420.00\n${label}   420.00`;
    assert.deepEqual(
      parseReceipt(r).map((i) => i.name), ['Sinigang na Baboy'],
      `"${label}" leaked into the item list`,
    );
  }
});

test('dish names that merely resemble a summary label survive', () => {
  const r = `Taho            45.00
Totchos        180.00
Chao Fan       150.00`;
  assert.deepEqual(parseReceipt(r).map((i) => i.name), ['Taho', 'Totchos', 'Chao Fan']);
});
