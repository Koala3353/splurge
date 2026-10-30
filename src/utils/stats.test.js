import test from 'node:test';
import assert from 'node:assert/strict';
import { monthlySpend, collectionRate, splitCompanions } from './stats.js';

const NOW = new Date('2026-10-15T12:00:00').getTime();
const bill = (total, date, participants = ['me', 'raf']) => ({
  id: `${date}-${total}`, total, date: new Date(date).toISOString(), participants,
});

test('monthly spend keeps quiet months rather than collapsing them', () => {
  const out = monthlySpend(
    [bill(1000, '2026-10-02'), bill(500, '2026-10-09'), bill(800, '2026-08-11')],
    { months: 4, now: NOW },
  );
  assert.equal(out.length, 4);
  assert.deepEqual(out.map((m) => m.label), ['Jul', 'Aug', 'Sep', 'Oct']);
  assert.deepEqual(out.map((m) => m.total), [0, 800, 0, 1500]);
  assert.deepEqual(out.map((m) => m.count), [0, 1, 0, 2]);
});

test('bars are scaled against the busiest month in view', () => {
  const out = monthlySpend([bill(1000, '2026-10-02'), bill(500, '2026-09-02')], {
    months: 2, now: NOW,
  });
  assert.equal(out[1].pct, 100);
  assert.equal(out[0].pct, 50);
});

test('a bill outside the window is ignored, not folded into the edge month', () => {
  const out = monthlySpend([bill(9999, '2025-01-01')], { months: 3, now: NOW });
  assert.deepEqual(out.map((m) => m.total), [0, 0, 0]);
});

test('an undated or malformed bill cannot crash the chart', () => {
  const out = monthlySpend([{ total: 100 }, { total: 100, date: 'nonsense' }], {
    months: 2, now: NOW,
  });
  assert.deepEqual(out.map((m) => m.total), [0, 0]);
});

test('a bill with no total is summed from its items and fees', () => {
  const out = monthlySpend([{
    id: 'b', date: '2026-10-05T00:00:00Z',
    items: [{ price: 300 }, { price: 200 }],
    fees: [{ amount: 50 }],
  }], { months: 1, now: NOW });
  assert.equal(out[0].total, 550);
});

const PEOPLE = [{ id: 'me', name: 'Me' }, { id: 'raf', name: 'Rafael' }, { id: 'mika', name: 'Mika' }];

test('collection rate measures what came back against what was owed', () => {
  const r = collectionRate({
    people: PEOPLE, meId: 'me',
    lifetimePayments: { me: 9999, raf: 300, mika: 200 },
    balances: { me: 5000, raf: 500, mika: 0 },
  });
  // Your own figures are excluded entirely — you never owed yourself.
  assert.equal(r.collected, 500);
  assert.equal(r.outstanding, 500);
  assert.equal(r.rate, 0.5);
});

test('nothing billed yet is not nought per cent collected', () => {
  const r = collectionRate({ people: PEOPLE, meId: 'me' });
  assert.equal(r.rate, null);
});

test('everything settled is a full rate, not a divide by zero', () => {
  const r = collectionRate({
    people: PEOPLE, meId: 'me',
    lifetimePayments: { raf: 800 },
    balances: { raf: 0 },
  });
  assert.equal(r.rate, 1);
});

test('companions are ranked by how often you split, not by how much', () => {
  const out = splitCompanions({
    people: PEOPLE, meId: 'me',
    bills: [
      bill(100, '2026-10-01', ['me', 'raf']),
      bill(100, '2026-10-02', ['me', 'raf']),
      bill(100, '2026-10-03', ['me', 'raf']),
      // One very expensive trip should not outrank three nights out.
      bill(90000, '2026-10-04', ['me', 'mika']),
    ],
  });
  assert.equal(out[0].person.name, 'Rafael');
  assert.equal(out[0].count, 3);
  assert.equal(out[0].pct, 100);
  assert.equal(out[1].count, 1);
});

test('you are never your own top companion', () => {
  const out = splitCompanions({
    people: PEOPLE, meId: 'me',
    bills: [bill(100, '2026-10-01', ['me', 'raf'])],
  });
  assert.ok(out.every((r) => r.person.id !== 'me'));
});

test('a deleted person drops out of the ranking', () => {
  const out = splitCompanions({
    people: [{ id: 'me', name: 'Me' }], meId: 'me',
    bills: [bill(100, '2026-10-01', ['me', 'ghost'])],
  });
  assert.equal(out.length, 0);
});

test('an equal tie is broken by name, so the order never jitters', () => {
  const out = splitCompanions({
    people: PEOPLE, meId: 'me',
    bills: [bill(100, '2026-10-01', ['me', 'raf']), bill(100, '2026-10-02', ['me', 'mika'])],
  });
  assert.deepEqual(out.map((r) => r.person.name), ['Mika', 'Rafael']);
});
