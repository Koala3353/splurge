// The ordered list of "things worth trying" for one photo.
//
// Ordering matters far more than breadth: scanReceipt stops as soon as a read
// is good enough, so the combinations most likely to succeed go first and the
// expensive long tail only runs when the receipt is genuinely hard.

import { loadImage } from './env.js';
import {
  applyVariant, buildPerspective, copyCanvas, deskew, detectCrop,
  looksSideways, renderRegion, rotate90, skewOf,
} from './preprocess.js';

// Page-segmentation modes. PSM 4 ("single column of variable-size lines")
// sounds like the right description of a receipt, but it silently drops the
// right-hand price column whenever the gap between item name and amount is
// wide — which is how most receipts are printed. PSM 6 treats the receipt as
// one uniform block and keeps both columns on the same line, which is what the
// parser needs in order to pair a name with its amount.
export const PSM_BLOCK = '6';
export const PSM_COLUMN = '4';

// Knobs the evaluation harness sweeps (scripts/ocr-eval). Defaults are the
// values the measured runs settled on; `legacy` reproduces the pre-revamp
// pipeline so an A/B is one flag rather than a git stash.
export const DEFAULT_TUNING = {
  plausibleQuadOnly: true,     // reject "paper" blobs that aren't receipt-shaped
  // Divide the lighting out before the paper/table split. Without it a shadow
  // across the receipt is what Otsu separates, not the paper.
  flattenIllumination: true,
  perspectiveMinStrength: 0.06,
  racePlainCropFirst: true,    // on an angled shot, keep the sharp crop in the race early
  orientationPhotoGuard: true, // don't call a receipt sideways inside a portrait photo
  // A ±90° candidate makes a structural claim about the photo, so it has to
  // win on structural evidence (priced items / fee lines) — not on a word
  // count or a two-point confidence wobble.
  rotationNeedsStrongEvidence: true,
  columnFallback: true,
};

export const LEGACY_TUNING = {
  plausibleQuadOnly: false,
  flattenIllumination: false,
  perspectiveMinStrength: 0.06,
  racePlainCropFirst: false,
  orientationPhotoGuard: false,
  rotationNeedsStrongEvidence: false,
  columnFallback: true,
};

export async function buildCandidates(file, tuning = DEFAULT_TUNING) {
  const t = { ...DEFAULT_TUNING, ...tuning };
  const img = await loadImage(file);
  const crop = detectCrop(img, { flattenLight: t.flattenIllumination });
  // Flattened render of the paper, present only when the shot is genuinely
  // angled. On a steep shot nothing else in the list can recover converging
  // text lines.
  const flat = buildPerspective(img, {
    minStrength: t.perspectiveMinStrength,
    plausibleQuadOnly: t.plausibleQuadOnly,
    flattenLight: t.flattenIllumination,
  });

  const renders = new Map();                       // "source|variant" -> canvas
  const baseOf = (source, variant) => {
    const k = `${source}|${variant}`;
    if (!renders.has(k)) {
      const base = source === 'flat'
        ? copyCanvas(flat.canvas)
        : renderRegion(img, source === 'crop' ? crop : null);
      renders.set(k, applyVariant(base, variant));
    }
    return renders.get(k);
  };

  // Orientation. The paper's own shape is the strongest signal available and
  // it is already measured: receipts are printed on a tall narrow roll, so a
  // detected region that is wider than it is tall means the photo was taken
  // sideways. Pixel-statistics probes were tried first and proved unreliable —
  // adaptive binarization speckles blank paper, and a global threshold turns
  // the shadowed edge of an unevenly-lit receipt into a solid block, and either
  // one flattens the line structure the measurement depends on.
  let vertical;
  const shape = flat ? { w: flat.canvas.width, h: flat.canvas.height } : crop;
  const probeSideways = () => looksSideways(baseOf(crop ? 'crop' : 'full', 'original'));
  if (shape && Math.max(shape.w, shape.h) / Math.min(shape.w, shape.h) > 1.2) {
    const byShape = shape.w > shape.h;
    // Measured on CORD-v2: the shape rule called 21 of 60 upright receipts
    // sideways, and every one of those rotations destroyed the read. The
    // cause was always the same — a bad quad or crop produced a landscape
    // "paper" region inside a portrait photo. A receipt photographed sideways
    // needs a landscape-ish frame to lie in, so that combination is evidence
    // the REGION is wrong, not that the phone was turned.
    if (t.orientationPhotoGuard && byShape && img.height > img.width * 1.1) {
      vertical = probeSideways();
    } else {
      vertical = byShape;
    }
  } else {
    // No decisive crop (square-ish receipt, or paper filling the frame): fall
    // back to text-energy profiles, which are at least unbiased here.
    vertical = probeSideways();
  }

  const skewCache = new Map();
  const make = (source, variant, deg, psm) => ({
    variant, deg, psm, source,
    cropped: source !== 'full',
    run: () => {
      const base = baseOf(source, variant);
      const rotated = deg === 0 ? base : rotate90(base, deg);
      const k = `${source}|${deg}`;
      if (!skewCache.has(k)) {
        const ref = deg === 0 ? baseOf(source, 'threshold')
          : rotate90(baseOf(source, 'threshold'), deg);
        skewCache.set(k, skewOf(ref));
      }
      const angle = skewCache.get(k);
      return Math.abs(angle) >= 1 ? deskew(rotated, angle) : rotated;
    },
  });

  const primary = vertical ? 90 : 0;
  const others = vertical ? [-90, 0] : [90, -90];
  const C = flat ? 'flat' : (crop ? 'crop' : 'full');
  const out = [make(C, 'threshold', primary, PSM_BLOCK)];
  // A sideways photo is 90° or -90° and the paper's shape cannot say which, so
  // resolve the flip immediately rather than after three variants of the wrong
  // rotation — it is the difference between two passes and five.
  if (vertical) out.push(make(C, 'threshold', -90, PSM_BLOCK));
  // A flattened render can only be as good as the corners it was built from.
  // Measured on CORD-v2: when the unwarp fires, the plain crop beats it more
  // often than not, and burying the crop behind two more variants of the flat
  // render meant the early exit never reached it. Second place, not sixth.
  if (t.racePlainCropFirst && flat && crop) out.push(make('crop', 'threshold', primary, PSM_BLOCK));
  out.push(make(C, 'contrast', primary, PSM_BLOCK));
  out.push(make(C, 'original', primary, PSM_BLOCK));
  // If a crop was taken, give the untouched frame a shot before spending
  // passes on rotations — a wrong crop is the failure this recovers from.
  if (C !== 'full') out.push(make('full', 'threshold', primary, PSM_BLOCK));
  if (!t.racePlainCropFirst && flat && crop) out.push(make('crop', 'threshold', primary, PSM_BLOCK));
  for (const deg of others) {
    if (vertical && deg === -90) continue;   // already tried above
    out.push(make(C, 'threshold', deg, PSM_BLOCK));
    out.push(make(C, 'contrast', deg, PSM_BLOCK));
  }
  // Column mode lost to block mode on every layout measured, but it stays as a
  // final fallback for a read that produced nothing at all.
  if (t.columnFallback) out.push(make(C, 'threshold', primary, PSM_COLUMN));
  return out;
}
