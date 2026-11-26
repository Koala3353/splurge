// THE canonical vocabulary for what a scan did and how much to trust it.
//
// This used to exist in three divergent copies (ocr.js, ScanResultDialog.jsx,
// ScanDiagnostics.jsx) whose confidence thresholds disagreed — 75/55 in one
// screen, 80/60 in the next — so a 78% scan was green on one and amber on the
// other. Every consumer imports from here instead.

/** Image treatment applied before recognition. */
export const VARIANT_LABELS = {
  threshold: {
    label: 'High contrast',
    short: 'high contrast',
    hint: 'Converted to pure black on white. Best on dark or unevenly lit shots.',
  },
  contrast: {
    label: 'Contrast boost',
    short: 'contrast boost',
    hint: 'Grays stretched apart without flattening them. Best on faint thermal print.',
  },
  original: {
    label: 'Original photo',
    short: 'original colours',
    hint: 'Used the photo untouched — it was already clean.',
  },
};

/** Which region of the photo the recogniser was given. */
export const SOURCE_LABELS = {
  flat: { label: 'Flattened from an angle', short: 'flattened' },
  crop: { label: 'Cropped to the receipt', short: 'cropped' },
  full: { label: 'Whole photo', short: 'full photo' },
};

export const variantLabel = (v) => VARIANT_LABELS[v]?.label || v || 'Unknown';
export const variantHint = (v) => VARIANT_LABELS[v]?.hint || '';
export const sourceLabel = (s) => SOURCE_LABELS[s]?.label || s || 'Whole photo';

// Confidence bands.
//
// Measured against CORD-v2 ground truth (scripts/ocr-eval): engine confidence
// is a WEAK predictor of whether the parse is right. Across 60 photographed
// receipts, strict F1 was 37.6% below 58% confidence and 40.9% between 58 and
// 77 — barely separated — and the handful of scans above 78% were not better.
// So these thresholds are presentation, not a quality gate: nothing in the
// pipeline branches on them, and every band's copy tells the user to check the
// numbers. If a future run shows the bands genuinely separating, that is the
// moment to let confidence drive behaviour; until then it must not.
export const CONFIDENCE_GOOD = 78;
export const CONFIDENCE_FAIR = 58;

/** 'good' | 'fair' | 'poor' — the single source for every confidence colour. */
export function confidenceBand(c) {
  if (!Number.isFinite(c)) return 'poor';
  if (c >= CONFIDENCE_GOOD) return 'good';
  if (c >= CONFIDENCE_FAIR) return 'fair';
  return 'poor';
}

// There is deliberately no colour here.
//
// Confidence used to carry a CSS tone (green / amber / red). Two reasons it is
// gone. The palette reserves colour for money alone, so a coloured confidence
// readout would be the only non-money colour in the product. And the CORD-v2
// evaluation found engine confidence does NOT predict extraction accuracy — a
// high-confidence scan is not a correct one — so colouring it would dress a
// bad signal as a verdict. Confidence is reported in ink, as information about
// the IMAGE, never as a guarantee about the NUMBERS.

/**
 * Headline + body for the scan result dialog. `items` is the number of line
 * items the parser produced; zero items beats any confidence score.
 */
export function confidenceVerdict(c, items) {
  if (items === 0) {
    return {
      band: 'poor',
      head: "Couldn't read it",
      body: 'No line items came out of that photo. Retaking it usually beats fixing it by hand.',
    };
  }
  const band = confidenceBand(c);
  if (band === 'good') {
    return {
      band,
      head: 'Clean read',
      body: 'The text came through clearly. Still worth a glance before you split it.',
    };
  }
  if (band === 'fair') {
    return {
      band,
      head: 'Readable, check the numbers',
      body: 'Some characters were uncertain. Prices are the ones worth verifying.',
    };
  }
  return {
    band,
    head: 'Rough read — check every line',
    body: 'The engine was unsure of a lot of this. Compare it against the paper before you split.',
  };
}
