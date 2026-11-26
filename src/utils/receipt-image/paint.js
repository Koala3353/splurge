/**
 * The painter. It executes a plan and makes no decisions of its own — every
 * x, y, colour and string was settled in layout.js, which is why that file can
 * be tested without a canvas and this one is small enough to read.
 */
import { GEOMETRY, PAPER } from './layout.js';
import { FAMILIES, fontCss } from './fonts.js';

/** A measurer bound to a context, for the planner to lay figures out with. */
export function measurerFor(ctx, families = FAMILIES) {
  return (text, font) => {
    ctx.font = fontCss(font, families);
    if ('letterSpacing' in ctx) ctx.letterSpacing = font.tracking || '0px';
    const width = ctx.measureText(text ?? '').width;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    return width;
  };
}

/**
 * The perforated edge: half-circle bites of the page cut out of the sheet's
 * top and bottom, matching `.sheet-paper::before/::after`. They are cut to
 * transparent rather than filled with a background colour, so the image reads
 * as a torn-off sheet on a light chat background and on a dark one.
 */
function perforate(ctx, width, height) {
  const r = GEOMETRY.perf / 2;
  const step = GEOMETRY.perf * 1.6;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = '#000';
  for (let x = step / 2; x < width + step; x += step) {
    ctx.beginPath();
    ctx.arc(x, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, height, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function paintReceipt(ctx, plan, { families = FAMILIES } = {}) {
  const { width, height, ops } = plan;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = PAPER.sheet;
  ctx.fillRect(0, 0, width, height);

  ops.forEach((op) => {
    if (op.type === 'rule') {
      ctx.fillStyle = op.color;
      ctx.fillRect(op.x1, op.y - op.width / 2, op.x2 - op.x1, op.width);
      return;
    }

    if (op.type === 'leader') {
      ctx.fillStyle = op.color;
      op.dots.forEach((x) => {
        ctx.beginPath();
        ctx.arc(x, op.y, op.radius, 0, Math.PI * 2);
        ctx.fill();
      });
      return;
    }

    if (op.type === 'text') {
      ctx.font = fontCss(op.font, families);
      if ('letterSpacing' in ctx) ctx.letterSpacing = op.font.tracking || '0px';
      ctx.fillStyle = op.color;
      ctx.textAlign = op.align;
      ctx.textBaseline = 'top';
      ctx.fillText(op.text, op.x, op.y);
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    }
  });

  perforate(ctx, width, height);
  return plan;
}
