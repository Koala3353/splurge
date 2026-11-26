import test from 'node:test';
import assert from 'node:assert/strict';
import {
  monthlySpend, collectionRate, splitCompanions,
  settleDurations, settleSpeed, payOrder, chaseList, settleTrend,
} from './stats.js';

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

/* ---- getting paid back -------------------------------------------------- *
 * Payments carry no bill id, so every figure below is derived by replaying
 * the FIFO allocation. These pin the derivation itself, not just its shape.  */

const NAMED = [
  { id: 'me', name: 'Jackson' },
  { id: 'raf', name: 'Rafael Dimaculangan' },
  { id: 'mika', name: 'Mikaela Bautista' },
  { id: 'chi', name: 'Jericho Panganiban' },
];

// A two-person split where only `who` owes: one item, assigned to them alone.
const owes = (id, date, price, who = ['raf']) => ({
  id, date: new Date(date).toISOString(),
  participants: ['me', ...who],
  items: [{ price, people: who }],
  fees: [],
});

const pay = (personId, amount, date) => ({
  id: `${personId}-${date}-${amount}`, personId, amount,
  date: date === null ? undefined : new Date(date).toISOString(),
});

const dur = (opts) => settleDurations({ people: NAMED, meId: 'me', ...opts });
const find = (records, billId, personId) =>
  records.find((r) => r.bill.id === billId && r.person.id === personId);

test('a settle date is walked out of the FIFO allocation, not matched by amount', () => {
  // Rafael owes ₱847.50 then ₱1,312.25. He sends ₱900, then ₱1,259.75.
  // Oldest-first: the first payment closes the Jan split and leaves ₱52.50
  // against the Feb one, which the second payment finishes.
  const records = dur({
    bills: [owes('b1', '2026-01-05', 847.5), owes('b2', '2026-02-10', 1312.25)],
    payments: [pay('raf', 900, '2026-01-12'), pay('raf', 1259.75, '2026-03-02')],
  });
  assert.equal(find(records, 'b1', 'raf').days, 7);
  assert.equal(find(records, 'b2', 'raf').days, 20);
  assert.ok(records.every((r) => r.settled));
});

test('a partial payment settles nothing, and the share stays open', () => {
  const records = dur({
    bills: [owes('b1', '2026-01-05', 1480.6)],
    payments: [pay('raf', 600, '2026-01-20')],
  });
  const r = find(records, 'b1', 'raf');
  assert.equal(r.settled, false);
  assert.equal(r.days, null);
  assert.equal(r.remaining, 880.6);
});

test('a person who never pays has no settle time at all', () => {
  const records = dur({
    bills: [owes('b1', '2026-01-05', 925.4, ['chi'])],
    payments: [],
  });
  assert.equal(find(records, 'b1', 'chi').days, null);
  assert.equal(find(records, 'b1', 'chi').settled, false);
});

test('you are never in your own payback figures', () => {
  const records = dur({
    bills: [{
      id: 'b1', date: '2026-01-05T00:00:00Z', participants: ['me', 'raf'],
      items: [{ price: 1000, people: ['me', 'raf'] }], fees: [],
    }],
    payments: [],
  });
  assert.ok(records.every((r) => r.person.id !== 'me'));
});

test('a split settled before its own date reads as nought days, never negative', () => {
  const records = dur({
    bills: [owes('b1', '2026-03-20', 640)],
    payments: [pay('raf', 640, '2026-03-02')],
  });
  assert.equal(find(records, 'b1', 'raf').days, 0);
});

test('an undated payment settles the split but cannot time it', () => {
  const records = dur({
    bills: [owes('b1', '2026-01-05', 480)],
    payments: [pay('raf', 480, null)],
  });
  const r = find(records, 'b1', 'raf');
  assert.equal(r.settled, true);
  assert.equal(r.days, null);
  assert.equal(r.settledAt, null);
});

test('an undated bill does not destabilise the allocation', () => {
  const records = dur({
    bills: [{ id: 'b1', participants: ['me', 'raf'], items: [{ price: 300, people: ['raf'] }] }],
    payments: [pay('raf', 300, '2026-01-10')],
  });
  assert.equal(find(records, 'b1', 'raf').settled, true);
});

test('a deleted person in a historical bill is left out', () => {
  const records = dur({
    bills: [owes('b1', '2026-01-05', 500, ['ghost'])],
    payments: [],
  });
  assert.equal(records.length, 0);
});

test('a one-participant split bills nobody but you, so it is not a wait', () => {
  const records = dur({
    bills: [{
      id: 'solo', date: '2026-01-05T00:00:00Z', participants: ['me'],
      items: [{ price: 220, people: ['me'] }], fees: [],
    }],
    payments: [],
  });
  assert.equal(records.length, 0);
});

const spread = (personId, days, start = 1) => days.map((d, i) => ({
  bill: owes(`${personId}-${start + i}`, `2026-0${start + i}-01`, 100),
  person: NAMED.find((p) => p.id === personId),
  due: 100, remaining: 0, settled: true, settledAt: 1, days: d,
}));

test('a median settle time ignores one holiday that took nine months', () => {
  const s = settleSpeed({ records: spread('raf', [2, 3, 4, 5, 270]) });
  assert.equal(s.medianDays, 4);
  assert.equal(s.samples, 5);
});

test('nobody is ranked on fewer than three settled splits', () => {
  const s = settleSpeed({ records: [...spread('raf', [1, 2, 3]), ...spread('mika', [1], 7)] });
  assert.deepEqual(s.ranked.map((r) => r.person.id), ['raf']);
  assert.deepEqual(s.withheld.map((r) => r.person.id), ['mika']);
  assert.equal(s.withheld[0].samples, 1);
  assert.equal(s.minSamples, 3);
});

test('one settled split overall is not an answer to how long your money takes', () => {
  assert.equal(settleSpeed({ records: spread('raf', [4]) }).medianDays, null);
});

test('who pays first counts races won, which speed alone does not', () => {
  const bills = [owes('b1', '2026-01-05', 1200, ['raf', 'mika'])];
  const records = dur({
    bills,
    // Mikaela is slower in days overall but is first on this split.
    payments: [pay('mika', 600, '2026-01-06'), pay('raf', 600, '2026-01-25')],
  });
  const order = payOrder({ records, minSamples: 1 });
  assert.equal(order.ranked[0].person.id, 'mika');
  assert.equal(order.ranked[0].rate, 1);
  assert.equal(order.ranked[1].firsts, 0);
  assert.equal(order.ranked[1].contests, 1);
});

test('a split only one person owed on is no race', () => {
  const records = dur({
    bills: [owes('b1', '2026-01-05', 500)],
    payments: [pay('raf', 500, '2026-01-06')],
  });
  assert.equal(payOrder({ records, minSamples: 1 }).ranked.length, 0);
});

test('a chronic non-payer keeps losing races rather than vanishing', () => {
  const records = dur({
    bills: [
      owes('b1', '2026-01-05', 900, ['raf', 'chi']),
      owes('b2', '2026-02-05', 900, ['raf', 'chi']),
      owes('b3', '2026-03-05', 900, ['raf', 'chi']),
    ],
    payments: [
      pay('raf', 450, '2026-01-06'), pay('raf', 450, '2026-02-06'), pay('raf', 450, '2026-03-06'),
    ],
  });
  const order = payOrder({ records });
  assert.equal(order.ranked[0].person.id, 'raf');
  assert.equal(order.ranked[1].person.id, 'chi');
  assert.equal(order.ranked[1].firsts, 0);
  assert.equal(order.ranked[1].contests, 3);
});

test('who pays first is withheld until three races have been run', () => {
  const records = dur({
    bills: [owes('b1', '2026-01-05', 900, ['raf', 'chi'])],
    payments: [pay('raf', 450, '2026-01-06')],
  });
  const order = payOrder({ records });
  assert.equal(order.ranked.length, 0);
  assert.equal(order.withheld.length, 2);
  assert.equal(order.withheld[0].contests, 1);
});

test('the chase list is ordered by how long you have waited, not by how much', () => {
  const now = new Date('2026-04-01T00:00:00Z').getTime();
  const records = dur({
    bills: [
      owes('old', '2026-01-01', 180, ['chi']),
      owes('big', '2026-03-25', 4200, ['mika']),
    ],
    payments: [],
  });
  const chase = chaseList({ records, now });
  assert.equal(chase.oldest.person.id, 'chi');
  assert.equal(chase.oldest.oldestDays, 90);
  assert.equal(chase.oldest.oldestBill.id, 'old');
  assert.equal(chase.people[1].person.id, 'mika');
});

test('a settled split is nobody you have to chase', () => {
  const records = dur({
    bills: [owes('b1', '2026-01-05', 500)],
    payments: [pay('raf', 500, '2026-01-06')],
  });
  assert.equal(chaseList({ records, now: Date.now() }).people.length, 0);
});

test('a partly paid split is chased for what is left of it', () => {
  const now = new Date('2026-02-01T00:00:00Z').getTime();
  const records = dur({
    bills: [owes('b1', '2026-01-01', 1000)],
    payments: [pay('raf', 375.25, '2026-01-10')],
  });
  const chase = chaseList({ records, now });
  assert.equal(chase.people[0].outstanding, 624.75);
  assert.equal(chase.people[0].oldestDays, 31);
});

test('the trend files a split under the month it was split, not the month it was paid', () => {
  const now = new Date('2026-06-15T00:00:00Z').getTime();
  const records = dur({
    bills: [owes('b1', '2026-02-02', 400)],
    payments: [pay('raf', 400, '2026-06-01')],
  });
  const trend = settleTrend({ records, months: 6, now });
  const feb = trend.months.find((m) => m.key === '2026-02');
  assert.equal(feb.samples, 1);
  assert.equal(feb.medianDays, 119);
  assert.equal(trend.months.find((m) => m.key === '2026-06').medianDays, null);
});

test('a trend verdict is withheld until both halves of the window carry it', () => {
  const now = new Date('2026-06-15T00:00:00Z').getTime();
  const thin = settleTrend({ records: spread('raf', [3, 4, 5]), months: 6, now });
  assert.equal(thin.change, null);
});
