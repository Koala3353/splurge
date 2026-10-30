import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPersonRequest,
  buildGroupReminder,
  buildBillBreakdown,
  buildPaymentStatus,
} from './shareText.js';

const bill = (title, total, date = '2026-10-20T19:00:00Z') => ({
  id: title, title, total, date,
  participants: ['me', 'raf'],
  items: [{ id: 'i1', name: title, price: total, people: ['me', 'raf'] }],
});

// Every outbound string is checked against these. They are the tells that make
// a message read as written by software rather than by the person sending it.
const TELLS = [
  [/—/, 'an em-dash'],
  [/\bSent with\b|\bSplurge\b/i, 'an app signature'],
  [/\bplease be advised\b|\bkindly\b|\bat your earliest\b/i, 'filler formality'],
  [/\bTotal:\s/, 'a spreadsheet footer'],
  [/\byou're at\b/i, 'a dashboard reading itself aloud'],
  [/\bThat's after\b/i, 'the app defending its own arithmetic'],
];

const assertHuman = (text) => {
  for (const [re, what] of TELLS) {
    assert.ok(!re.test(text), `reads as machine-written (${what}):\n${text}`);
  }
  // Nothing should open with a header over a block that is its own label.
  assert.ok(!/^Here's the breakdown/im.test(text), `redundant header:\n${text}`);
};

test('a single outstanding split asks for the money, it does not report a status', () => {
  const text = buildPersonRequest({
    person: { id: 'raf', name: 'Rafael' },
    amount: 640,
    unpaid: [{ bill: bill('Dinner', 1280), remaining: 640 }],
  });
  assertHuman(text);
  assert.equal(text, 'Hey Rafael, ₱640 for Dinner whenever you can.');
});

test('several splits lead into the list rather than announcing it', () => {
  const text = buildPersonRequest({
    person: { id: 'raf', name: 'Rafael' },
    amount: 900,
    unpaid: [
      { bill: bill('Dinner', 1280), remaining: 640 },
      { bill: bill('Coffee', 520), remaining: 260 },
    ],
  });
  assertHuman(text);
  assert.ok(text.startsWith('Hey Rafael, ₱900 from 2 splits:'), text);
  assert.ok(text.includes('Dinner: ₱640'), text);
  assert.ok(text.includes('Coffee: ₱260'), text);
});

test('a part payment is an aside, not an explanation', () => {
  const text = buildPersonRequest({
    person: { id: 'raf', name: 'Rafael' },
    amount: 800,
    unpaid: [{ bill: bill('Dinner', 2010), remaining: 800 }],
    paidTotal: 205,
    options: { showPaid: true },
  });
  assertHuman(text);
  assert.ok(text.includes('(₱205 you already sent is off this)'), text);
});

test('nothing owed says so and stops', () => {
  const text = buildPersonRequest({ person: { id: 'raf', name: 'Rafael' }, amount: 0 });
  assertHuman(text);
  assert.equal(text, "Hey Rafael, you're all settled.");
});

test('the greeting can be dropped without breaking the sentence', () => {
  const text = buildPersonRequest({
    person: { id: 'raf', name: 'Rafael' },
    amount: 640,
    unpaid: [{ bill: bill('Dinner', 1280), remaining: 640 }],
    options: { greeting: false },
  });
  assertHuman(text);
  assert.equal(text, '₱640 for Dinner whenever you can.');
});

test('a group reminder adds up out loud, and only once it is worth saying', () => {
  const two = buildGroupReminder({
    rows: [{ name: 'Rafael', amount: 600 }, { name: 'Mika', amount: 400 }],
    label: 'Baguio trip',
  });
  assertHuman(two);
  assert.ok(two.startsWith('Baguio trip, still open:'), two);
  assert.ok(!two.includes('altogether'), 'two rows do not need a sum');

  const three = buildGroupReminder({
    rows: [
      { name: 'Rafael', amount: 600 },
      { name: 'Mika', amount: 400 },
      { name: 'Tina', amount: 250 },
    ],
  });
  assertHuman(three);
  assert.ok(three.includes('₱1,250 altogether.'), three);
});

test('a part-paid row can only be read one way', () => {
  const text = buildGroupReminder({
    rows: [{ name: 'Rafael', amount: 800, paid: 205 }],
    options: { showPaid: true },
  });
  assertHuman(text);
  // "₱800 (₱205 paid)" is ambiguous about whether the 205 is inside the 800.
  assert.ok(text.includes('₱800 left of ₱1,005'), text);
});

test('a settled group is one short sentence', () => {
  assert.equal(buildGroupReminder({ rows: [], label: 'Baguio trip' }),
    "Baguio trip, everyone's settled.");
  assert.equal(buildGroupReminder({ rows: [] }), "Everyone's settled.");
});

test('a bill breakdown reads as a sentence, not a record', () => {
  const text = buildBillBreakdown({
    bill: bill('Dinner', 1280),
    dues: { me: 640, raf: 640 },
    nameOf: (id) => ({ me: 'me', raf: 'Rafael' }[id]),
  });
  assertHuman(text);
  assert.ok(text.startsWith('Dinner came to ₱1,280.'), text);
});

test('payment status names who is still owing and who is done', () => {
  const text = buildPaymentStatus({
    bill: bill('Dinner', 1280),
    statusByPerson: {
      raf: { due: 640, paid: 0, remaining: 640 },
      mika: { due: 320, paid: 320, remaining: 0 },
    },
    nameOf: (id) => ({ raf: 'Rafael', mika: 'Mika' }[id]),
    meId: 'me',
    options: { showPaid: true },
  });
  assertHuman(text);
  assert.ok(text.includes('still waiting on:'), text);
});

test('every template survives having no data at all', () => {
  for (const text of [
    buildPersonRequest({ person: null, amount: 0 }),
    buildGroupReminder({ rows: [] }),
    buildBillBreakdown({ bill: null }),
    buildPaymentStatus({ bill: null }),
  ]) {
    assert.equal(typeof text, 'string');
    assertHuman(text);
  }
});
