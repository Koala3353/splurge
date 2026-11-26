import test from 'node:test';
import assert from 'node:assert/strict';

import { uid } from './id.js';

test('uid returns a distinct id each time', () => {
  const ids = new Set(Array.from({ length: 500 }, () => uid()));
  assert.equal(ids.size, 500);
});

test('uid falls back when randomUUID is missing', () => {
  // The real failure: `crypto.randomUUID` is secure-context-only, so on the
  // normal phone-over-LAN test path (http://192.168.x.x:5173) it is simply not
  // there and an unguarded call throws, killing "Add item".
  const real = globalThis.crypto;
  try {
    Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true });
    assert.equal(typeof uid(), 'string');
    assert.ok(uid().length > 0);
    assert.notEqual(uid(), uid());
  } finally {
    Object.defineProperty(globalThis, 'crypto', { value: real, configurable: true });
  }
});

test('uid falls back when there is no crypto at all', () => {
  const real = globalThis.crypto;
  try {
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    assert.equal(typeof uid(), 'string');
  } finally {
    Object.defineProperty(globalThis, 'crypto', { value: real, configurable: true });
  }
});
