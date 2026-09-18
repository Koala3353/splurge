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
