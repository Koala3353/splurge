// One ordering for bills, so two screens can never disagree about which split
// is the most recent one. HomePage used to sort by date while HistoryPage used
// `[...bills].reverse()`, and the same splits rendered as two different lists.

/**
 * A bill's date as a finite number of milliseconds.
 *
 * A missing or unparseable date reads as 0 (the oldest possible split) rather
 * than NaN. NaN in a comparator makes it inconsistent — `a - b` and `b - a`
 * both come back NaN, so the sort result depends on the input order and on the
 * engine's sort implementation. That instability is invisible in a list and
 * expensive in the oldest-first payment allocation, where it decides which
 * split someone's money paid off.
 */
export function billTime(bill) {
  const t = Date.parse(bill?.date);
  return Number.isFinite(t) ? t : 0;
}

// Same timestamp (common: two splits saved the same second) falls back to id,
// so the order is total rather than merely stable-by-luck.
const byDateAsc = (a, b) => billTime(a) - billTime(b) || String(a?.id).localeCompare(String(b?.id));

/** Oldest first — the order money is applied in. */
export function sortBillsByDateAsc(bills = []) {
  return [...bills].sort(byDateAsc);
}

/** Most recent first — the order every list on screen shows. */
export function sortBillsByDate(bills = []) {
  return [...bills].sort((a, b) => -byDateAsc(a, b));
}
