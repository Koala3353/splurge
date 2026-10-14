import test from 'node:test';
import assert from 'node:assert/strict';
import { linesFromBlocks } from './ocr.js';
import { parseReceipt } from './receipt.js';

// Build a Tesseract-shaped block tree from rows of [text, x0, x1, y0, y1].
const word = (text, x0, x1, y0, y1, confidence = 90) => ({
  text, confidence, bbox: { x0, x1, y0, y1 },
});
const asBlocks = (groups) => groups.map((words) => ({
  paragraphs: [{ lines: [{ words }] }],
}));

test('rejoins a name and a price the engine split into separate blocks', () => {
  // Names on the left, prices on the right — emitted as two columns, which is
  // what a wide gap makes Tesseract do.
  const names = [
    word('Chicken', 20, 120, 100, 124),
    word('Adobo', 124, 190, 100, 124),
    word('Iced', 20, 70, 140, 164),
    word('Tea', 74, 120, 140, 164),
  ];
  const prices = [
    word('180.00', 400, 480, 101, 125),
    word('95.00', 410, 480, 141, 165),
  ];
  const text = linesFromBlocks(asBlocks([names, prices]));
  const lines = text.split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /^Chicken Adobo\s+180\.00$/);
  assert.match(lines[1], /^Iced Tea\s+95\.00$/);
});

test('the rejoined text parses into priced items', () => {
  const blocks = asBlocks([
    [word('Latte', 20, 90, 100, 124), word('Pandesal', 20, 110, 140, 164)],
    [word('150.00', 400, 480, 102, 126), word('45.00', 410, 480, 142, 166)],
  ]);
  const items = parseReceipt(linesFromBlocks(blocks));
  assert.deepEqual(
    items.map((i) => [i.name, i.price]),
    [['Latte', 150], ['Pandesal', 45]],
  );
});

test('keeps genuinely separate lines apart', () => {
  const blocks = asBlocks([[
    word('Garlic', 20, 90, 100, 124),
    word('Rice', 94, 140, 100, 124),
    word('Bottled', 20, 100, 160, 184),
    word('Water', 104, 170, 160, 184),
  ]]);
  assert.deepEqual(linesFromBlocks(blocks).split('\n'), ['Garlic Rice', 'Bottled Water']);
});

test('drops words the engine had no confidence in', () => {
  const blocks = asBlocks([[
    word('Rice', 20, 70, 100, 124),
    word('~|`', 80, 100, 100, 124, 12),
    word('50.00', 400, 460, 100, 124),
  ]]);
  assert.equal(linesFromBlocks(blocks).includes('~|`'), false);
});

test('returns nothing when there is almost no text to work with', () => {
  assert.equal(linesFromBlocks(asBlocks([[word('x', 0, 5, 0, 5)]])), '');
  assert.equal(linesFromBlocks(null), '');
});
