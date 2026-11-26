import test from 'node:test';
import assert from 'node:assert/strict';

import { computeSettlement, paymentsWithoutBill } from './settlement.js';

const people = [{ id: 'me', name: 'Me' }, { id: 'ana', name: 'Ana' }];

// One item, split between Me and Ana, so Ana owes exactly half.
const bill = (id, date, price) => ({
  id,
  title: id,
  date,
  participants: ['me', 'ana'],
  items: [{ id: `${id}-i`, name: id, price, people: ['me', 'ana'] }],
  fees: [],
});

const pay = (id, amount, date) => ({ id, personId: 'ana', amount, date, note: '' });

test('a balance is what they were billed less what they have paid', () => {
  const { balances, lifetimePayments } = computeSettlement({
    people,
    bills: [bill('b1', '2026-01-01', 1000)],
    payments: [pay('p1', 200, '2026-01-02')],
  });
  assert.equal(balances.ana, 300);
  assert.equal(lifetimePayments.ana, 200);
});

test('payments settle the oldest split first', () => {
  const { billPersonStatus, unpaidBillShares } = computeSettlement({
    people,
    bills: [bill('old', '2026-01-01', 1000), bill('new', '2026-02-01', 1000)],
    payments: [pay('p1', 500, '2026-02-02')],
  });
  assert.equal(billPersonStatus.old.ana.remaining, 0);
  assert.equal(billPersonStatus.new.ana.remaining, 500);
  assert.deepEqual(unpaidBillShares.ana.map((s) => s.bill.id), ['new']);
});

test('a split with an unreadable date does not scramble the allocation', () => {
  // `new Date(a.date) - new Date(b.date)` is NaN whenever either date is
  // broken, which makes the comparator inconsistent and the FIFO order an
  // accident of the input array. The same input, reordered, must settle the
  // same splits.
  const bills = [bill('dated', '2026-02-01', 1000), bill('broken', 'not-a-date', 1000)];
  const payments = [pay('p1', 500, '2026-03-01')];

  const a = computeSettlement({ people, bills, payments });
  const b = computeSettlement({ people, bills: [...bills].reverse(), payments });

  assert.deepEqual(a.billPersonStatus.broken.ana, b.billPersonStatus.broken.ana);
  assert.deepEqual(a.billPersonStatus.dated.ana, b.billPersonStatus.dated.ana);
  assert.deepEqual(
    a.unpaidBillShares.ana.map((s) => s.bill.id),
    b.unpaidBillShares.ana.map((s) => s.bill.id),
  );
});

test('paying more than you owe leaves a visible credit, not a silent one', () => {
  const { credits, balances } = computeSettlement({
    people,
    bills: [bill('b1', '2026-01-01', 1000)],
    payments: [pay('p1', 800, '2026-01-02')],
  });
  assert.equal(balances.ana, -300);
  assert.equal(credits.ana, 300);
});

test('no credit while anything is still owed', () => {
  const { credits } = computeSettlement({
    people,
    bills: [bill('b1', '2026-01-01', 1000)],
    payments: [pay('p1', 200, '2026-01-02')],
  });
  assert.equal(credits.ana, 0);
});

test('two centavo-rounded part payments settle a centavo-rounded debt', () => {
  // ₱3.33 each way on a ₱10 bill: two ₱1.67 rows must not leave ₱0.01 owed
  // forever, nor read as unpaid.
  const threeWay = {
    id: 'b1',
    title: 'Grab',
    date: '2026-01-01',
    participants: ['me', 'ana', 'bea'],
    items: [{ id: 'i1', price: 10, people: ['me', 'ana', 'bea'] }],
    fees: [],
  };
  const { billPersonStatus } = computeSettlement({
    people: [...people, { id: 'bea', name: 'Bea' }],
    bills: [threeWay],
    payments: [pay('p1', 1.67, '2026-01-02'), pay('p2', 1.66, '2026-01-03')],
  });
  assert.equal(billPersonStatus.b1.ana.remaining, 0);
});

test('the settled list carries only splits that were actually covered', () => {
  const { settledBillShares } = computeSettlement({
    people,
    bills: [bill('old', '2026-01-01', 1000), bill('new', '2026-02-01', 1000)],
    payments: [pay('p1', 500, '2026-02-02')],
  });
  assert.deepEqual(settledBillShares.ana.map((s) => s.bill.id), ['old']);
});

test('the payer taking the odd centavo is reflected in their own share', () => {
  const threeWay = {
    id: 'b1',
    date: '2026-01-01',
    participants: ['me', 'ana', 'bea'],
    items: [{ id: 'i1', price: 10, people: ['me', 'ana', 'bea'] }],
    fees: [],
  };
  const { billDuesById } = computeSettlement({
    people: [...people, { id: 'bea', name: 'Bea' }],
    bills: [threeWay],
    payments: [],
    meId: 'me',
  });
  assert.equal(billDuesById.b1.me, 3.34);
  assert.equal(billDuesById.b1.ana, 3.33);
  assert.equal(billDuesById.b1.bea, 3.33);
});

// --- Finding P0-6: deleting a bill must not leave its payments behind ---

test('deleting a bill takes the payments made against it with it', () => {
  const bills = [bill('dupe', '2026-01-01', 1000), bill('dinner', '2026-02-01', 800)];
  const payments = [pay('p1', 500, '2026-01-02')];

  const left = paymentsWithoutBill({ bills, payments, billId: 'dupe' });
  assert.deepEqual(left, []);

  // And the next bill is not quietly credited with it.
  const after = computeSettlement({
    people,
    bills: bills.filter((b) => b.id !== 'dupe'),
    payments: left,
  });
  assert.equal(after.balances.ana, 400);
  assert.equal(after.billPersonStatus.dinner.ana.remaining, 400);
});

test('a payment that spanned two bills is only trimmed by the deleted one', () => {
  const bills = [bill('old', '2026-01-01', 1000), bill('new', '2026-02-01', 1000)];
  const payments = [pay('p1', 800, '2026-02-02')];

  const left = paymentsWithoutBill({ bills, payments, billId: 'old' });
  assert.equal(left.length, 1);
  assert.equal(left[0].amount, 300);
  assert.equal(left[0].id, 'p1');
});

test('deleting an unpaid bill leaves every payment alone', () => {
  const bills = [bill('old', '2026-01-01', 1000), bill('new', '2026-02-01', 1000)];
  const payments = [pay('p1', 400, '2026-01-02')];
  const left = paymentsWithoutBill({ bills, payments, billId: 'new' });
  assert.deepEqual(left, payments);
});

test('a payment left as pure credit survives deleting a bill it never covered', () => {
  const bills = [bill('b1', '2026-01-01', 1000)];
  const payments = [pay('p1', 900, '2026-01-02')];
  const left = paymentsWithoutBill({ bills, payments, billId: 'b1' });
  // ₱500 of the ₱900 went to this bill; the ₱400 credit is still theirs.
  assert.equal(left.length, 1);
  assert.equal(left[0].amount, 400);
});

test('paymentsWithoutBill is a no-op for an unknown bill id', () => {
  const bills = [bill('b1', '2026-01-01', 1000)];
  const payments = [pay('p1', 500, '2026-01-02')];
  assert.deepEqual(paymentsWithoutBill({ bills, payments, billId: 'nope' }), payments);
});

test('settlement ignores payments and dues for people who no longer exist', () => {
  const { balances } = computeSettlement({
    people,
    bills: [bill('b1', '2026-01-01', 1000)],
    payments: [{ id: 'p1', personId: 'ghost', amount: 500, date: '2026-01-02' }],
  });
  assert.equal(balances.ana, 500);
  assert.equal(balances.ghost, undefined);
});
