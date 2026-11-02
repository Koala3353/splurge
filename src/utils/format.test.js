import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCompact, formatCurrency } from './format.js';

test('exact amounts keep their centavos', () => {
  assert.equal(formatCurrency(480), '₱480.00');
  assert.equal(formatCurrency(1234.5), '₱1,234.50');
});

test('compact amounts drop centavos below a thousand too', () => {
  // The regression this guards: "₱480.00" is 52px at 12px type, which does
  // not fit a 37px chart column on a 320px phone.
  assert.equal(formatCompact(480), '₱480');
  assert.equal(formatCompact(0), '₱0');
  assert.equal(formatCompact(999), '₱999');
});

test('compact amounts stay compact above a thousand', () => {
  assert.equal(formatCompact(1000), '₱1K');
  assert.equal(formatCompact(16600), '₱16.6K');
});

test('a negative balance compacts without losing its sign', () => {
  assert.equal(formatCompact(-480), '₱-480');
});

test('a non-numeric amount is zero, not NaN on screen', () => {
  assert.equal(formatCompact(undefined), '₱0');
  assert.equal(formatCompact(NaN), '₱0');
  assert.equal(formatCurrency('nonsense'), '₱0.00');
});
