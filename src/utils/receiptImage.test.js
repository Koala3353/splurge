import test from 'node:test';
import assert from 'node:assert/strict';

import { pixelRatio, receiptFileName } from './receiptImage.js';
import { buildReceipt, firstNameOf } from './receipt-image/model.js';
import {
  FONTS,
  GEOMETRY,
  PAPER,
  leaderDots,
  planReceipt,
  truncateToWidth,
  wrapLines,
} from './receipt-image/layout.js';

// A perfectly monospaced measurer. The real one asks the canvas; this one lets
// every column assertion below be exact rather than approximately exact.
const CELL = 0.6;
const measure = (text, font) => (text ?? '').length * font.size * CELL;

const bill = {
  title: 'Friday dinner',
  date: '2025-08-12T12:00:00.000Z',
  participants: ['me', 'p2', 'p3', 'p4'],
  items: [
    { name: 'Sisig', price: 480 },
    { name: 'Crispy pata with extra vinegar dipping sauce', price: 980 },
    { name: 'Garlic rice', price: 180 },
    { name: 'San Miguel', price: 360 },
    { name: 'Halo-halo', price: 240 },
    { name: 'Calamansi juice', price: 120 },
  ],
  fees: [
    { name: 'Service charge', amount: 236 },
    { name: 'Senior discount', amount: -150 },
  ],
};

const dues = { me: 600, p2: 700, p3: 646, p4: 0 };
const nameOf = (id) => ({ me: 'me', p2: 'Ana Cruz', p3: 'Beni Santos', p4: 'Jericho Dela Cruz' }[id]);

const model = (over = {}) => buildReceipt({ bill, dues, nameOf, meId: 'me', ...over });
const plan = (over = {}) => planReceipt(model(over), { measure });

/* ------------------------------------------------------------- privacy */

test('the image carries first names, not full ones', () => {
  const people = model().people.map((p) => p.name);
  assert.deepEqual(people, ['You', 'Ana', 'Beni', 'Jericho']);
});

test('a saved payment number is left off unless it is asked for', () => {
  const payInfo = { method: 'GCash', number: '0917 555 0101' };
  assert.equal(model({ payInfo }).payLine, null);
  assert.equal(model({ payInfo, includePayInfo: true }).payLine, 'GCash 0917 555 0101');
  // Opting in with nothing saved still puts nothing on the image.
  assert.equal(model({ payInfo: null, includePayInfo: true }).payLine, null);
});

test('firstNameOf keeps the store\'s "me" out of the people column', () => {
  assert.equal(firstNameOf('me'), 'You');
  assert.equal(firstNameOf('  Ana  Cruz '), 'Ana');
  assert.equal(firstNameOf(''), 'Someone');
});

test('a zero share is settled, and it is the only coloured figure', () => {
  const people = model().people;
  assert.equal(people.find((p) => p.name === 'Jericho').settled, true);
  assert.equal(people.find((p) => p.name === 'Ana').settled, false);

  const coloured = plan().ops.filter(
    (op) => op.type === 'text' && op.color !== PAPER.ink && op.color !== PAPER.ink2
      && op.color !== PAPER.ink3,
  );
  assert.deepEqual([...new Set(coloured.map((op) => op.color))], [PAPER.ledger]);
});

/* ---------------------------------------------------------------- wrap */

test('a 40-character item name wraps instead of running into the price', () => {
  const name = 'Crispy pata with extra vinegar dipping sauce';
  assert.ok(name.length > 40);
  const lines = wrapLines(name, 200, measure, FONTS.name, 2);
  assert.equal(lines.length, 2);
  lines.forEach((line) => assert.ok(measure(line, FONTS.name) <= 200));
});

test('a name too long for its budget is truncated, not spilled', () => {
  const lines = wrapLines('a '.repeat(60).trim(), 120, measure, FONTS.name, 2);
  assert.equal(lines.length, 2);
  assert.ok(lines[1].endsWith('…'));
  lines.forEach((line) => assert.ok(measure(line, FONTS.name) <= 120));
});

test('a single unbreakable word is cut to fit', () => {
  const out = truncateToWidth('Supercalifragilisticexpialidocious', 80, measure, FONTS.name);
  assert.ok(out.endsWith('…'));
  assert.ok(measure(out, FONTS.name) <= 80);
});

test('a short name is left alone', () => {
  assert.deepEqual(wrapLines('Sisig', 200, measure, FONTS.name, 2), ['Sisig']);
});

/* -------------------------------------------------------------- leader */

test('the dotted leader fills its gap exactly', () => {
  const dots = leaderDots(100, 180);
  assert.equal(dots[0], 100);
  assert.equal(dots[dots.length - 1], 180);
  const steps = dots.slice(1).map((x, i) => x - dots[i]);
  steps.forEach((s) => assert.ok(Math.abs(s - steps[0]) < 1e-9));
});

test('a gap with no room for dots gets none', () => {
  assert.deepEqual(leaderDots(100, 102), []);
  assert.deepEqual(leaderDots(100, 100), []);
});

/* ---------------------------------------------------- column alignment */

const figureOps = (p) => p.ops.filter((op) => op.type === 'text' && op.align === 'right');

test('every figure is right-aligned on one column', () => {
  const xs = new Set(figureOps(plan()).map((op) => op.x));
  assert.equal(xs.size, 1);
  assert.equal([...xs][0], GEOMETRY.width - GEOMETRY.padX);
});

test('the total shares the money column with every other figure', () => {
  const totalOp = plan().ops.find((op) => op.font === FONTS.total);
  assert.equal(totalOp.align, 'right');
  assert.equal(totalOp.x, GEOMETRY.width - GEOMETRY.padX);
});

test('no leader reaches its figure or its name', () => {
  const p = plan();
  p.ops.forEach((op, i) => {
    if (op.type !== 'leader') return;
    const name = p.ops.slice(0, i).reverse().find((o) => o.type === 'text' && o.align === 'left');
    const figure = p.ops[i + 1];
    const nameEnd = name.x + measure(name.text, name.font);
    const figureStart = figure.x - measure(figure.text, figure.font);
    assert.ok(op.x1 >= nameEnd, 'leader starts clear of the name');
    assert.ok(op.x2 <= figureStart, 'leader stops clear of the figure');
    assert.ok(op.x1 - nameEnd >= GEOMETRY.leaderGap - 1e-9);
    assert.ok(figureStart - op.x2 >= GEOMETRY.leaderGap - 1e-9);
    op.dots.forEach((x) => assert.ok(x >= op.x1 && x <= op.x2));
  });
});

test('nothing is drawn outside the sheet', () => {
  const p = plan({ payInfo: { method: 'GCash', number: '0917 555 0101' }, includePayInfo: true });
  p.ops.forEach((op) => {
    if (op.type === 'text') {
      const w = measure(op.text, op.font);
      const x1 = op.align === 'right' ? op.x - w : op.align === 'center' ? op.x - w / 2 : op.x;
      assert.ok(x1 >= GEOMETRY.padX - 1, `${op.text} starts inside the margin`);
      assert.ok(x1 + w <= p.width - GEOMETRY.padX + 1, `${op.text} ends inside the margin`);
      assert.ok(op.y >= 0 && op.y + op.font.size <= p.height);
    }
  });
});

test('the sheet grows with its contents and leaves room for the perforation', () => {
  const short = planReceipt(
    buildReceipt({ bill: { ...bill, items: bill.items.slice(0, 1), fees: [] }, dues, nameOf }),
    { measure },
  );
  const long = plan();
  assert.ok(long.height > short.height);
  const firstText = long.ops.find((op) => op.type === 'text');
  assert.ok(firstText.y >= GEOMETRY.perf);
  const lastText = [...long.ops].reverse().find((op) => op.type === 'text');
  assert.ok(long.height - (lastText.y + lastText.font.size) >= GEOMETRY.perf);
});

test('rows run in receipt order: items, fees, total, then who owes what', () => {
  const labels = plan().ops.filter((op) => op.type === 'text' && op.align === 'left')
    .map((op) => op.text);
  assert.ok(labels.indexOf('Sisig') < labels.indexOf('Service charge'));
  assert.ok(labels.indexOf('Service charge') < labels.indexOf('Total'));
  assert.ok(labels.indexOf('Total') < labels.indexOf('WHO OWES WHAT'));
  assert.ok(labels.indexOf('WHO OWES WHAT') < labels.indexOf('Ana'));
});

/* ------------------------------------------------------------ the file */

test('the file is named after the split', () => {
  assert.equal(receiptFileName('Friday dinner'), 'friday-dinner.png');
  assert.equal(receiptFileName(''), 'split.png');
  assert.equal(receiptFileName('  !!!  '), 'split.png');
});

test('the pixel ratio stays between 2 and 3', () => {
  assert.equal(pixelRatio(1), 2);
  assert.equal(pixelRatio(2), 2);
  assert.equal(pixelRatio(3), 3);
  assert.equal(pixelRatio(4), 3);
  assert.equal(pixelRatio(undefined), 2);
  assert.equal(pixelRatio(NaN), 2);
});

/* ------------------------------------------------------------ the paint */

// The painter is dumb by design, so one pass over a real 2D context is enough
// to prove the op list is executable. Font faces are the browser's problem and
// are verified there; this only asserts that nothing in the list throws and
// that the sheet is actually marked.
//
// @napi-rs/canvas is a prebuilt NATIVE module and deliberately not a
// dependency of this app — it exists only so the eval harness and this test
// can draw under Node. Requiring it in CI meant installing a platform binary
// for one assertion, and its per-platform optional deps are exactly what a
// macOS `npm install` omits from the lockfile and a Linux `npm ci` then
// rejects. So this skips when it is absent rather than failing, and runs for
// anyone who has installed the harness (`npm i -D @napi-rs/canvas`).
const canvasBackend = await (async () => {
  try {
    return await import('@napi-rs/canvas');
  } catch {
    return null;
  }
})();

test('the plan paints onto a real 2D context', { skip: canvasBackend ? false : 'needs @napi-rs/canvas' }, async () => {
  const { createCanvas } = canvasBackend;
  const { measurerFor, paintReceipt } = await import('./receipt-image/paint.js');

  const probe = createCanvas(10, 10);
  const p = planReceipt(model(), { measure: measurerFor(probe.getContext('2d')) });

  const canvas = createCanvas(p.width * 2, p.height * 2);
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);
  paintReceipt(ctx, p);

  const png = canvas.toBuffer('image/png');
  assert.ok(png.length > 1000);

  // The first bite of the perforation is cut to transparent; the middle of
  // the sheet is paper. getImageData reads device pixels, hence the doubling.
  assert.equal(ctx.getImageData(16, 2, 1, 1).data[3], 0);
  assert.ok(ctx.getImageData(p.width, p.height, 1, 1).data[3] > 0);
});
