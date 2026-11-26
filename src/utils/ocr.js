// Receipt OCR: one reused Tesseract worker (fast repeat scans), document-grade
// image preprocessing, and a best-first race over orientation/crop/binarization
// candidates. The pixel work lives in ./ocr/*; this file is the orchestration,
// the lifecycle (timeout, cancel, terminate) and the public surface.
//
// Measured, not guessed: scripts/ocr-eval runs this exact module over the
// CORD-v2 receipt corpus and scores it against ground truth.

import { rateReceiptText } from './receipt.js';
import { buildCandidates, DEFAULT_TUNING, PSM_COLUMN } from './ocr/candidates.js';
import { SOURCE_LABELS, VARIANT_LABELS } from './ocr/labels.js';
import { linesFromBlocks } from './ocr/lines.js';
import { thumbnail } from './ocr/preprocess.js';
import { toRecognizerInput } from './ocr/env.js';

export { linesFromBlocks } from './ocr/lines.js';
export {
  VARIANT_LABELS, SOURCE_LABELS, variantLabel, variantHint, sourceLabel,
  CONFIDENCE_GOOD, CONFIDENCE_FAIR,
  confidenceBand, confidenceVerdict,
} from './ocr/labels.js';
export { DEFAULT_TUNING, LEGACY_TUNING } from './ocr/candidates.js';
export { setOcrEnvironment } from './ocr/env.js';

/** A scan that was cancelled by the user or that ran out of time. */
export class ScanAbortedError extends Error {
  constructor(reason) {
    super(reason === 'timeout'
      ? 'The scan took too long and was stopped.'
      : 'Scan cancelled.');
    this.name = 'ScanAbortedError';
    this.reason = reason;              // 'timeout' | 'cancelled'
    this.cancelled = reason === 'cancelled';
    this.timedOut = reason === 'timeout';
  }
}

/** A hung scan used to trap the user behind a full-screen overlay forever. */
export const SCAN_TIMEOUT_MS = 45_000;

let workerPromise = null;
let progressCb = null;
let activeController = null;

// Lazily create — and reuse — a single configured worker. Calling this early
// (e.g. when the user taps "Scan") warms the engine while they pick a photo.
export function warmUpOcr() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng', 1, {
        logger: (m) => {
          if (!progressCb) return;
          if (m.status === 'recognizing text') progressCb(`Reading text… ${Math.round(m.progress * 100)}%`);
          else if (/load|traineddata|initial/i.test(m.status)) progressCb('Warming up the scanner (one-time)…');
        },
      });
      await worker.setParameters({
        preserve_interword_spaces: '1',
        // Tesseract guesses the source DPI from the image height and, on a
        // cropped receipt, guesses low — which makes it treat normal glyphs as
        // oversized and pick the wrong character models. The preprocessor
        // already normalises every candidate to roughly 300dpi-equivalent
        // glyph heights, so state it instead of letting it be inferred.
        user_defined_dpi: '300',
        // Our binarizer always outputs dark-on-light, so the engine's own
        // invert-and-retry pass can only waste time.
        tessedit_do_invert: '0',
      });
      return worker;
    })().catch((err) => { workerPromise = null; throw err; });
  }
  return workerPromise;
}

/**
 * Tear the engine down. Called on every abort path, and safe to call when no
 * worker exists. After this the next scan pays the (one-time) warm-up again,
 * which is the correct trade: a worker that was mid-recognize when we walked
 * away is not a worker worth keeping.
 */
export async function terminateOcr() {
  const p = workerPromise;
  workerPromise = null;
  if (!p) return;
  try { (await p).terminate(); } catch { /* already gone */ }
}

/**
 * Cancel the scan currently in flight, if any. The in-progress call rejects
 * with a ScanAbortedError whose `.cancelled` is true, and the worker is
 * terminated so a wedged recognize cannot keep burning the phone's battery.
 *
 * Wire this to the overlay's Cancel button:
 *     <button onClick={cancelScan}>Cancel</button>
 */
export function cancelScan() {
  activeController?.abort('cancelled');
}

/** True while a scan is running — for disabling the file input, etc. */
export const isScanning = () => activeController !== null;

export async function scanReceipt(file, onProgress, options = {}) {
  const {
    signal,                               // optional external AbortSignal
    timeoutMs = SCAN_TIMEOUT_MS,
    tuning = DEFAULT_TUNING,
  } = options;
  const t = { ...DEFAULT_TUNING, ...tuning };

  // One controller per scan: cancelScan(), the caller's own signal and the
  // timeout all funnel into it, so there is exactly one place that decides a
  // scan is over and exactly one cleanup path.
  const controller = new AbortController();
  const abortWith = (reason) => controller.abort(reason);
  if (signal) {
    if (signal.aborted) throw new ScanAbortedError('cancelled');
    signal.addEventListener('abort', () => abortWith('cancelled'), { once: true });
  }
  const timer = timeoutMs > 0 ? setTimeout(() => abortWith('timeout'), timeoutMs) : null;

  activeController?.abort('cancelled');      // a new scan supersedes an old one
  activeController = controller;
  progressCb = onProgress || null;

  const reasonOf = () => (controller.signal.reason === 'timeout' ? 'timeout' : 'cancelled');
  const checkpoint = () => {
    if (controller.signal.aborted) throw new ScanAbortedError(reasonOf());
  };

  try {
    onProgress?.('Optimizing image…');
    const candidates = await buildCandidates(file, tuning); // lazy thunks, best-first
    checkpoint();
    const worker = await warmUpOcr();
    checkpoint();

    // Race key, most important first:
    //  1. money items + fee lines (×2) — strong evidence of a real read
    //  2. bare-integer items, CAPPED at 1 — name+integer garbage is exactly
    //     what busy backgrounds hallucinate, so more of them isn't better
    //  3. engine confidence, bucketed — a finer signal than word count, but
    //     coarse enough that a 2-point wobble can't outrank real evidence
    //  4. word count — only as a final tie-break (never lets noise outvote)
    const keyOf = (rate, confidence, words) => [
      2 * (rate.money + rate.fees),
      Math.min(rate.bare, 1),
      Math.round(confidence / 10),
      words,
    ];
    const gt = (a, b) => {
      for (let k = 0; k < a.length; k++) {
        if (a[k] !== b[k]) return a[k] > b[k];
      }
      return false;
    };

    let appliedPsm = null;
    let best = { text: '', key: [-1, 0, 0, 0], deg: null, diagnostics: null };
    let attempts = 0;

    let lastReason = null;
    for (let i = 0; i < candidates.length; i++) {
      checkpoint();
      const cand = candidates[i];
      onProgress?.(
        i === 0 ? 'Reading the receipt…' : `Retrying — ${lastReason}`,
        { attempt: i + 1, total: candidates.length, trying: describeAttempt(cand), reason: lastReason },
      );
      let canvas;
      try { canvas = cand.run(); } catch { continue; }
      checkpoint();
      if (cand.psm !== appliedPsm) {
        await worker.setParameters({ tessedit_pageseg_mode: cand.psm });
        appliedPsm = cand.psm;
      }
      const { data } = await worker.recognize(toRecognizerInput(canvas), {}, { text: true, blocks: true });
      checkpoint();
      attempts += 1;
      const confidence = Number.isFinite(data.confidence) ? data.confidence : 0;

      // Two readings of the same pass: the engine's own line breaks, and the
      // lines rebuilt from word boxes. They differ only when a wide price
      // column confused the layout analysis, which is exactly the case the
      // rebuild exists for — so let the rating decide, per scan.
      let rebuilt = '';
      try { rebuilt = linesFromBlocks(data.blocks); } catch { /* text still fine */ }
      let readingText = data.text;
      let readingKey = keyOf(
        rateReceiptText(data.text),
        confidence,
        data.text.split(/\s+/).filter(Boolean).length,
      );
      let rebuiltUsed = false;
      if (rebuilt) {
        const altKey = keyOf(
          rateReceiptText(rebuilt),
          confidence,
          rebuilt.split(/\s+/).filter(Boolean).length,
        );
        if (gt(altKey, readingKey)) {
          readingText = rebuilt;
          readingKey = altKey;
          rebuiltUsed = true;
        }
      }

      const rate = rateReceiptText(readingText);
      const key = readingKey;
      // Measured on CORD-v2: on every receipt where a ±90° candidate won the
      // race, the pipeline returned ZERO correct items — 21 of 60 receipts.
      // A rotated read of an upright receipt is garbage that still produces
      // words, and word count was enough to outrank the real read. Rotating
      // the page is a structural claim; make it win on structural evidence.
      const rotationBlocked = t.rotationNeedsStrongEvidence
        && cand.deg !== 0 && best.deg === 0 && key[0] <= best.key[0];
      if (!rotationBlocked && gt(key, best.key)) {
        best = {
          text: readingText,
          key,
          deg: cand.deg,
          diagnostics: {
            variant: cand.variant,
            source: cand.source,
            orientation: cand.deg,
            cropped: cand.cropped,
            psm: cand.psm,
            confidence: Math.round(confidence),
            relaid: rebuiltUsed,
            width: canvas.width,
            height: canvas.height,
            preview: thumbnail(canvas),
          },
        };
      }
      lastReason = describeRejection(rate, confidence);
      if (best.key[0] >= 4) break;            // ≥2 strong signals — done
      if (best.key[0] >= 2 && i >= 1) break;  // 1 strong signal + both variants tried
    }

    return {
      text: best.text,
      diagnostics: { ...(best.diagnostics || {}), attempts, tried: candidates.length },
    };
  } catch (err) {
    if (controller.signal.aborted) {
      // Whatever the engine was doing, it is no longer wanted. Terminate
      // rather than reuse: a worker abandoned mid-recognize is not trustworthy.
      await terminateOcr();
      throw err instanceof ScanAbortedError ? err : new ScanAbortedError(reasonOf());
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
    if (activeController === controller) activeController = null;
    progressCb = null;
  }
}

// Plain-language description of what a given attempt is doing, and of why the
// previous one was not good enough. A bare "Trying another read…" tells you
// nothing; naming the reason makes a failed scan diagnosable from the progress
// line alone.
function describeAttempt(c) {
  const bits = [
    VARIANT_LABELS[c.variant]?.short || c.variant,
    SOURCE_LABELS[c.source]?.short || c.source,
  ];
  if (c.deg !== 0) bits.push(`rotated ${c.deg > 0 ? '90°' : '-90°'}`);
  if (c.psm === PSM_COLUMN) bits.push('column mode');
  return bits.join(', ');
}

function describeRejection(rate, confidence) {
  if (rate.money === 0 && rate.fees === 0 && rate.bare === 0) return 'no prices found';
  if (rate.money === 0 && rate.fees === 0) return 'prices looked like stray numbers';
  if (confidence < 55) return `low confidence (${Math.round(confidence)}%)`;
  return 'only a partial read';
}
