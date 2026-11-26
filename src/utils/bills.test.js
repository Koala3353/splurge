import test from 'node:test';
import assert from 'node:assert/strict';

import { billTime, sortBillsByDate, sortBillsByDateAsc } from './bills.js';

const b = (id, date) => ({ id, date, title: id });

test('sortBillsByDate puts the most recent split first', () => {
  const list = [b('a', '2026-01-10'), b('c', '2026-03-01'), b('b', '2026-02-01')];
  assert.deepEqual(sortBillsByDate(list).map((x) => x.id), ['c', 'b', 'a']);
});

test('sortBillsByDate ignores insertion order, so a backdated split lands by date', () => {
  // The bug: History showed insertion order while Home showed date order, so
  // the same splits read as two different lists.
  const list = [b('new', '2026-03-01'), b('backdated', '2025-06-01')];
  assert.deepEqual(sortBillsByDate(list).map((x) => x.id), ['new', 'backdated']);
  assert.deepEqual(sortBillsByDate([...list].reverse()).map((x) => x.id), ['new', 'backdated']);
});

test('sortBillsByDate does not mutate its input', () => {
  const list = [b('a', '2026-01-10'), b('b', '2026-02-01')];
  sortBillsByDate(list);
  assert.deepEqual(list.map((x) => x.id), ['a', 'b']);
});

test('an undated split sorts as the oldest rather than at random', () => {
  const list = [b('dated', '2026-01-10'), b('undated', undefined), b('junk', 'not a date')];
  assert.deepEqual(sortBillsByDateAsc(list).map((x) => x.id), ['junk', 'undated', 'dated']);
});

test('bills with identical dates keep a stable, id-based order either way round', () => {
  const same = '2026-01-10T00:00:00.000Z';
  const list = [b('b2', same), b('a1', same)];
  assert.deepEqual(sortBillsByDate(list).map((x) => x.id), sortBillsByDate([...list].reverse()).map((x) => x.id));
});

test('billTime is a finite number even for a broken date', () => {
  assert.equal(Number.isFinite(billTime({ date: 'nonsense' })), true);
  assert.equal(Number.isFinite(billTime({})), true);
  assert.equal(billTime({ date: '2026-01-10T00:00:00.000Z' }), Date.parse('2026-01-10T00:00:00.000Z'));
});
