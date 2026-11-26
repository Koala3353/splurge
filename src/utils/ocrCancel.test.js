import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ScanAbortedError, SCAN_TIMEOUT_MS, cancelScan, isScanning, scanReceipt, setOcrEnvironment,
} from './ocr.js';

// A fake canvas backend: enough surface for buildCandidates to run without a
// real engine, and slow enough to be cancelled mid-flight.
function fakeEnvironment() {
  const canvas = (w, h) => ({
    width: Math.max(1, Math.round(w)),
    height: Math.max(1, Math.round(h)),
    getContext: () => ({
      drawImage() {},
      fillRect() {},
      translate() {},
      rotate() {},
      putImageData() {},
      createImageData: (w2, h2) => ({ data: new Uint8ClampedArray(w2 * h2 * 4) }),
      getImageData: (_x, _y, w2, h2) => ({
        data: new Uint8ClampedArray(w2 * h2 * 4).fill(255),
        width: w2,
        height: h2,
      }),
    }),
  });
  setOcrEnvironment({
    createCanvas: canvas,
    loadImage: async () => ({ width: 400, height: 900 }),
    toRecognizerInput: (c) => c,
    encodeThumbnail: () => null,
  });
}

test('an already-aborted signal never starts a scan', async () => {
  fakeEnvironment();
  const ac = new AbortController();
  ac.abort();
  await assert.rejects(
    () => scanReceipt(new Uint8Array(8), null, { signal: ac.signal }),
    (err) => err instanceof ScanAbortedError && err.cancelled === true && err.timedOut === false,
  );
  setOcrEnvironment(null);
});

test('a zero-length timeout aborts the scan rather than hanging forever', async () => {
  fakeEnvironment();
  // The overlay used to have no exit at all: ocr.js:94 awaited the engine with
  // no deadline, so a wedged scan took the in-progress bill with it.
  await assert.rejects(
    () => scanReceipt(new Uint8Array(8), null, { timeoutMs: 1 }),
    (err) => err instanceof ScanAbortedError && err.timedOut === true && err.reason === 'timeout',
  );
  assert.equal(isScanning(), false, 'the scan must not stay registered as active');
  setOcrEnvironment(null);
});

test('cancelScan() is safe to call when nothing is running', () => {
  assert.equal(isScanning(), false);
  assert.doesNotThrow(() => cancelScan());
});

test('the shipped timeout is a value a person would wait out', () => {
  assert.ok(SCAN_TIMEOUT_MS >= 20_000 && SCAN_TIMEOUT_MS <= 60_000);
});

test('ScanAbortedError distinguishes the two ways a scan ends early', () => {
  const cancelled = new ScanAbortedError('cancelled');
  const timedOut = new ScanAbortedError('timeout');
  assert.equal(cancelled.cancelled, true);
  assert.equal(cancelled.timedOut, false);
  assert.equal(timedOut.timedOut, true);
  assert.match(timedOut.message, /too long/i);
});
