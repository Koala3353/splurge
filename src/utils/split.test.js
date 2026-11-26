import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computeBillDues,
  SETTLED_EPSILON,
  isSettled,
  toCents,
  withDerivedTotal,
} from './split.js';

// Every assertion in this file is in centavos. Pesos are floats, and a test
// written in floats can only ever prove the money is approximately right —
// which is the bug this file exists to catch.
const centsOf = (dues) => Object.values(dues).reduce((sum, v) => sum + toCents(v), 0);

// --- Finding P0-1: items nobody is on ---

test('reports items that no participant is sharing', () => {
  const bill = {
    participants: ['a', 'b'],
    items: [
      { id: 'i1', name: 'Sisig', price: 300, people: [] },
      { id: 'i2', name: 'Rice', price: 100, people: ['ghost'] },
      { id: 'i3', name: 'Beer', price: 100, people: ['a', 'b'] },
    ],
    fees: [],
  };
  const { unassigned } = computeBillDues(bill);
  assert.deepEqual(unassigned.map((it) => it.name), ['Sisig', 'Rice']);
});

test('no unassigned items when every item has a participant on it', () => {
  const { unassigned } = computeBillDues({
    participants: ['a'],
    items: [{ id: 'i1', price: 100, people: ['a'] }],
    fees: [],
  });
  assert.deepEqual(unassigned, []);
});

test('dues account for every centavo of the assigned items', () => {
  const bill = {
    participants: ['a', 'b'],
    items: [
      { id: 'i1', price: 300, people: [] },
      { id: 'i2', price: 100, people: ['a', 'b'] },
    ],
    fees: [],
  };
  const { dues, total, unassigned } = computeBillDues(bill);
  const unassignedCents = unassigned.reduce((sum, it) => sum + toCents(it.price), 0);
  assert.equal(unassignedCents, 30000);
  assert.equal(centsOf(dues), toCents(total) - unassignedCents);
});

// --- Finding P0-2: cent reconciliation ---

test('three ways on ten pesos still sums to ten pesos', () => {
  const { dues, total } = computeBillDues({
    participants: ['a', 'b', 'c'],
    items: [{ id: 'i1', price: 10, people: ['a', 'b', 'c'] }],
    fees: [],
  });
  assert.equal(centsOf(dues), 1000);
  assert.equal(toCents(total), 1000);
  assert.deepEqual(
    Object.values(dues).map(toCents).sort((x, y) => x - y),
    [333, 333, 334],
  );
});

test('the odd centavo goes to the payer when the payer is on the item', () => {
  const { dues } = computeBillDues({
    participants: ['a', 'b', 'c'],
    items: [{ id: 'i1', price: 10, people: ['a', 'b', 'c'] }],
    fees: [],
  }, { meId: 'b' });
  assert.equal(toCents(dues.b), 334);
  assert.equal(toCents(dues.a), 333);
  assert.equal(toCents(dues.c), 333);
});

test('without a payer on the item the odd centavo lands deterministically', () => {
  const run = () => computeBillDues({
    participants: ['a', 'b', 'c'],
    items: [{ id: 'i1', price: 10, people: ['a', 'b', 'c'] }],
    fees: [],
  }, { meId: 'someone-else' });
  assert.deepEqual(run().dues, run().dues);
  assert.equal(centsOf(run().dues), 1000);
});

test('a proportional fee is allocated to the centavo', () => {
  const { dues, total } = computeBillDues({
    participants: ['a', 'b'],
    items: [
      { id: 'i1', price: 10, people: ['a'] },
      { id: 'i2', price: 20, people: ['b'] },
    ],
    fees: [{ id: 'f1', name: 'Service', amount: 10 }],
  });
  assert.equal(toCents(total), 4000);
  assert.equal(centsOf(dues), 4000);
});

test('a proportional discount is allocated to the centavo', () => {
  const { dues, total } = computeBillDues({
    participants: ['a', 'b', 'c'],
    items: [{ id: 'i1', price: 100, people: ['a', 'b', 'c'] }],
    fees: [{ id: 'f1', name: 'PWD', amount: -10 }],
  }, { meId: 'a' });
  assert.equal(toCents(total), 9000);
  assert.equal(centsOf(dues), 9000);
});

test('a fee targeted at a subset only touches that subset', () => {
  const { dues } = computeBillDues({
    participants: ['a', 'b'],
    items: [
      { id: 'i1', price: 100, people: ['a'] },
      { id: 'i2', price: 100, people: ['b'] },
    ],
    fees: [{ id: 'f1', name: 'Corkage', amount: 50, people: ['b'] }],
  });
  assert.equal(toCents(dues.a), 10000);
  assert.equal(toCents(dues.b), 15000);
});

test('fees split evenly when nobody has an item share to be proportional to', () => {
  const { dues, total } = computeBillDues({
    participants: ['a', 'b', 'c'],
    items: [],
    fees: [{ id: 'f1', name: 'Entrance', amount: 10 }],
  });
  assert.equal(centsOf(dues), toCents(total));
  assert.equal(centsOf(dues), 1000);
});

// --- The invariant, over generated assignments ---

// Deterministic PRNG so a failure is reproducible from the seed alone.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

test('property: dues always sum to the assigned total, to the centavo', () => {
  for (let seed = 1; seed <= 400; seed++) {
    const rand = rng(seed);
    const n = 1 + Math.floor(rand() * 5);
    const participants = Array.from({ length: n }, (_, i) => `p${i}`);

    const items = Array.from({ length: Math.floor(rand() * 7) }, (_, i) => {
      // Prices with real centavos, including ones that never divide evenly.
      const price = Math.round(rand() * 500000) / 100;
      const people = participants.filter(() => rand() < 0.6);
      // Items nobody is on are covered by their own assertions below.
      if (people.length === 0) people.push(participants[Math.floor(rand() * n)]);
      return { id: `i${i}`, price, people };
    });

    const fees = Array.from({ length: Math.floor(rand() * 3) }, (_, i) => {
      const amount = Math.round((rand() * 60000 - 10000)) / 100;
      const targeted = rand() < 0.3;
      return {
        id: `f${i}`,
        amount,
        ...(targeted ? { people: participants.filter(() => rand() < 0.5) } : {}),
      };
    });

    const meId = rand() < 0.7 ? participants[Math.floor(rand() * n)] : null;
    const bill = { participants, items, fees };
    const { dues, total, unassigned } = computeBillDues(bill, { meId });

    assert.deepEqual(unassigned, [], `seed ${seed}: items were unexpectedly unassigned`);
    assert.equal(centsOf(dues), toCents(total), `seed ${seed}: dues do not sum to the total`);
  }
});

test('property: unassigned money is exactly the money missing from the dues', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const rand = rng(seed + 10000);
    const n = 1 + Math.floor(rand() * 4);
    const participants = Array.from({ length: n }, (_, i) => `p${i}`);
    const items = Array.from({ length: 1 + Math.floor(rand() * 5) }, (_, i) => ({
      id: `i${i}`,
      price: Math.round(rand() * 200000) / 100,
      people: participants.filter(() => rand() < 0.4),
    }));
    const bill = { participants, items, fees: [] };
    const { dues, total, unassigned } = computeBillDues(bill);
    const missing = unassigned.reduce((sum, it) => sum + toCents(it.price), 0);
    assert.equal(centsOf(dues), toCents(total) - missing, `seed ${seed}`);
  }
});

// --- Degenerate shapes ---

test('a bill with no participants owes nobody anything', () => {
  const { dues, total } = computeBillDues({ participants: [], items: [{ price: 50, people: [] }], fees: [] });
  assert.deepEqual(dues, {});
  assert.equal(toCents(total), 5000);
});

test('non-numeric prices count as zero rather than poisoning the total', () => {
  const { dues, total } = computeBillDues({
    participants: ['a'],
    items: [{ id: 'i1', price: '', people: ['a'] }, { id: 'i2', price: '12.50', people: ['a'] }],
    fees: [],
  });
  assert.equal(toCents(total), 1250);
  assert.equal(toCents(dues.a), 1250);
});

test('computeBillDues handles a missing bill', () => {
  const { dues, total, unassigned } = computeBillDues(undefined);
  assert.deepEqual(dues, {});
  assert.deepEqual(unassigned, []);
  assert.equal(total, 0);
});

// --- The settled epsilon ---

test('isSettled uses the one shared epsilon', () => {
  assert.equal(SETTLED_EPSILON, 0.005);
  assert.equal(isSettled(0), true);
  assert.equal(isSettled(0.004), true);
  assert.equal(isSettled(-0.004), true);
  assert.equal(isSettled(0.01), false);
  assert.equal(isSettled(-50), false);
});

// --- Finding P0-3: a bill that arrives without a total ---

test('withDerivedTotal fills in a missing total from the items and fees', () => {
  const bill = withDerivedTotal({
    participants: ['a', 'b'],
    items: [{ id: 'i1', price: 250, people: ['a', 'b'] }],
    fees: [{ id: 'f1', amount: 25 }],
  });
  assert.equal(bill.total, 275);
});

test('withDerivedTotal leaves a total the caller supplied alone', () => {
  const bill = withDerivedTotal({
    total: 500,
    participants: ['a'],
    items: [{ id: 'i1', price: 250, people: ['a'] }],
    fees: [],
  });
  assert.equal(bill.total, 500);
});

test('withDerivedTotal replaces a total that is not a number', () => {
  assert.equal(withDerivedTotal({ total: undefined, items: [{ price: 10, people: [] }] }).total, 10);
  assert.equal(withDerivedTotal({ total: NaN, items: [{ price: 10, people: [] }] }).total, 10);
  assert.equal(withDerivedTotal({ total: '300', items: [{ price: 10, people: [] }] }).total, 10);
});

test('withDerivedTotal keeps a deliberate zero total', () => {
  assert.equal(withDerivedTotal({ total: 0, items: [{ price: 10, people: [] }] }).total, 0);
});
