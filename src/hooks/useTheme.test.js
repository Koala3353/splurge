import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveTheme, THEMES } from './useTheme.js';

test('an explicit choice resolves to itself', () => {
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
});

test('auto follows the system', () => {
  assert.equal(resolveTheme('auto', true), 'dark');
  assert.equal(resolveTheme('auto', false), 'light');
});

test('an unknown stored value falls back to following the system', () => {
  assert.equal(resolveTheme('neon', true), 'dark');
  assert.equal(resolveTheme(undefined, false), 'light');
});

test('THEMES is the set the picker offers', () => {
  assert.deepEqual(THEMES, ['auto', 'light', 'dark']);
});
