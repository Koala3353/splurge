/**
 * A span of days, said the way a person would say it.
 *
 * Lives beside the stats components rather than in `format.js`, which is the
 * money-and-dates file: this is neither, and a duration is only ever rendered
 * on this page. A median across an even number of splits can land on a half
 * day, so one decimal survives and a trailing `.0` does not.
 */
export function formatDays(days) {
  if (days === null || days === undefined || !Number.isFinite(days)) return '—';
  const n = Math.round(days * 10) / 10;
  if (n === 0) return 'same day';
  return `${n} ${n === 1 ? 'day' : 'days'}`;
}

/** "needs 2 more settled splits" — what a withheld figure is waiting for. */
export function needsMore(samples, minSamples, unit = 'settled split') {
  const short = Math.max(1, minSamples - samples);
  return `needs ${short} more ${unit}${short === 1 ? '' : 's'}`;
}
