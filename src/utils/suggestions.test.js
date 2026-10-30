import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSuggestions } from './suggestions.js';

const PEOPLE = [{ id: 'me' }, { id: 'mika' }, { id: 'raf' }];
// A Thursday evening, so "weekday-evening" is the current slot.
const NOW = new Date('2026-10-29T20:00:00').getTime();
const DAY = 86400000;

const bill = (title, people, price, date) => ({
  id: `${title}-${date}`,
  title,
  date: new Date(date).toISOString(),
  participants: people,
  items: [{ id: 'i', name: title, price, people }],
  fees: [],
});

const run = (over = {}) =>
  buildSuggestions({ people: PEOPLE, meId: 'me', now: NOW, ...over });

test('a split made once is not yet a habit', () => {
  const out = run({ bills: [bill('Ramen', ['me', 'mika'], 700, '2026-10-20T19:00:00')] });
  assert.equal(out.length, 0);
});

test('a repeated split is suggested, at its typical amount', () => {
  const out = run({
    bills: [
      bill('Date night', ['me', 'mika'], 1200, '2026-10-01T20:00:00'),
      bill('Date night', ['me', 'mika'], 1600, '2026-10-15T20:00:00'),
      bill('Date night', ['me', 'mika'], 1400, '2026-10-22T20:00:00'),
    ],
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].title, 'Date night');
  assert.equal(out[0].amount, 1400); // median, not mean — one blowout can't skew it
  assert.deepEqual(out[0].people.sort(), ['me', 'mika']);
});

test('the same name with different people is a different split', () => {
  const out = run({
    bills: [
      bill('Dinner', ['me', 'mika'], 800, '2026-10-10T20:00:00'),
      bill('Dinner', ['me', 'mika'], 900, '2026-10-17T20:00:00'),
      bill('Dinner', ['me', 'raf'], 500, '2026-10-11T20:00:00'),
      bill('Dinner', ['me', 'raf'], 600, '2026-10-18T20:00:00'),
    ],
  });
  assert.equal(out.length, 2);
  assert.notEqual(out[0].people.join(), out[1].people.join());
});

test('punctuation and case do not split one habit into two', () => {
  const out = run({
    bills: [
      bill('Date Night!', ['me', 'mika'], 1000, '2026-10-08T20:00:00'),
      bill('date night', ['me', 'mika'], 1000, '2026-10-15T20:00:00'),
    ],
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].count, 2);
  // The most recent spelling is the one shown back to you.
  assert.equal(out[0].title, 'date night');
});

test('a habit that matches right now outranks one that is merely more recent', () => {
  const out = run({
    bills: [
      // Thursday evenings — the current slot.
      bill('Date night', ['me', 'mika'], 1200, '2026-10-01T20:00:00'),
      bill('Date night', ['me', 'mika'], 1200, '2026-10-08T20:00:00'),
      bill('Date night', ['me', 'mika'], 1200, '2026-10-15T20:00:00'),
      // Weekday mornings, and more recent.
      bill('Coffee', ['me', 'raf'], 200, '2026-10-26T09:00:00'),
      bill('Coffee', ['me', 'raf'], 200, '2026-10-27T09:00:00'),
      bill('Coffee', ['me', 'raf'], 200, '2026-10-28T09:00:00'),
    ],
  });
  assert.equal(out[0].title, 'Date night');
  assert.equal(out[0].kind, 'time');
  assert.match(out[0].reason, /weekday evenings/);
  assert.equal(out[1].title, 'Coffee');
});

test('a saved template outranks anything inferred', () => {
  const out = run({
    bills: [
      bill('Groceries', ['me', 'raf'], 2000, '2026-10-20T18:00:00'),
      bill('Groceries', ['me', 'raf'], 2000, '2026-10-27T18:00:00'),
    ],
    templates: [{ id: 't1', title: 'Rent', people: ['me', 'mika'], amount: 15000 }],
  });
  assert.equal(out[0].kind, 'template');
  assert.equal(out[0].title, 'Rent');
});

test('a template hides the history entry it duplicates', () => {
  const out = run({
    bills: [
      bill('Date night', ['me', 'mika'], 1200, '2026-10-08T20:00:00'),
      bill('Date night', ['me', 'mika'], 1200, '2026-10-15T20:00:00'),
    ],
    templates: [{ id: 't1', title: 'Date night', people: ['me', 'mika'], amount: 1300 }],
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, 'template');
  assert.equal(out[0].amount, 1300);
});

test('splits with nobody but you are not offered back', () => {
  const out = run({
    bills: [
      bill('Lunch', ['me'], 300, '2026-10-10T12:00:00'),
      bill('Lunch', ['me'], 300, '2026-10-17T12:00:00'),
    ],
  });
  assert.equal(out.length, 0);
});

test('a deleted person takes their suggestions with them', () => {
  const out = buildSuggestions({
    people: [{ id: 'me' }], // mika has been removed
    meId: 'me',
    now: NOW,
    bills: [
      bill('Date night', ['me', 'mika'], 1200, '2026-10-08T20:00:00'),
      bill('Date night', ['me', 'mika'], 1200, '2026-10-15T20:00:00'),
    ],
    templates: [{ id: 't1', title: 'Rent', people: ['mika'], amount: 15000 }],
  });
  assert.equal(out.length, 0);
});

test('a bill dated in the future cannot become a habit', () => {
  const out = run({
    bills: [
      bill('Trip', ['me', 'mika'], 5000, '2026-11-20T10:00:00'),
      bill('Trip', ['me', 'mika'], 5000, '2026-12-20T10:00:00'),
    ],
  });
  assert.equal(out.length, 0);
});

test('an old habit ranks below a current one', () => {
  const out = run({
    bills: [
      bill('Old thing', ['me', 'mika'], 100, new Date(NOW - 200 * DAY).toISOString()),
      bill('Old thing', ['me', 'mika'], 100, new Date(NOW - 190 * DAY).toISOString()),
      bill('New thing', ['me', 'raf'], 100, new Date(NOW - 10 * DAY).toISOString()),
      bill('New thing', ['me', 'raf'], 100, new Date(NOW - 3 * DAY).toISOString()),
    ],
  });
  assert.equal(out[0].title, 'New thing');
});

test('the list is capped', () => {
  const bills = [];
  for (let i = 0; i < 12; i++) {
    bills.push(bill(`Thing ${i}`, ['me', 'mika'], 100, `2026-10-0${(i % 9) + 1}T20:00:00`));
    bills.push(bill(`Thing ${i}`, ['me', 'mika'], 100, `2026-10-1${i % 9}T20:00:00`));
  }
  assert.equal(run({ bills, limit: 4 }).length, 4);
});
