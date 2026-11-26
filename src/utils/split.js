// Single source of truth for bill-splitting math.
// Used by the app store (to compute balances), the New Bill review screen, and
// the bill detail view, so the numbers always agree.
//
// Everything here is computed in integer centavos. Pesos are floats, and a
// float split is only ever approximately right: ₱10 three ways used to render
// ₱3.33 three times under a ₱10.00 headline, and the share message sent those
// same three figures to three friends. Allocating whole centavos inside this
// function makes the store, the review screen and the outbound text agree by
// construction rather than by coincidence.

const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/** Below this, an amount is money nobody will ever chase. One definition, used everywhere. */
export const SETTLED_EPSILON = 0.005;

/** True when an amount is close enough to zero to call settled. */
export function isSettled(amount) {
  return Math.abs(num(amount)) <= SETTLED_EPSILON;
}

/** Pesos (or a numeric string) to whole centavos. */
export function toCents(value) {
  return Math.round(num(value) * 100);
}

/** Whole centavos back to pesos, with no float residue. */
export function fromCents(cents) {
  return Math.round(cents) / 100;
}

/**
 * Hand out `totalCents` across `weights` so the parts sum to it exactly
 * (largest remainder). Everyone gets the floor of their exact share; the
 * leftover centavos go out one each, in this order:
 *
 *   1. the payer, who is the one person in the room who can't be shortchanged
 *      by a centavo they are already holding,
 *   2. then the largest fractional remainder, then the largest share, then
 *      position — so the result never depends on object key order.
 *
 * For a negative amount (a PWD/senior discount) the order is reversed, so
 * rounding never hands the payer a bigger discount than the others.
 */
function allocateCents(totalCents, weights, payerIndex) {
  const n = weights.length;
  if (n === 0) return [];

  const sign = totalCents < 0 ? -1 : 1;
  const magnitude = Math.abs(totalCents);

  let w = weights.map((x) => (Number.isFinite(x) && x > 0 ? x : 0));
  let sum = w.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    w = w.map(() => 1);
    sum = n;
  }

  const exact = w.map((x) => (magnitude * x) / sum);
  const out = exact.map((x) => Math.floor(x));
  let left = magnitude - out.reduce((a, b) => a + b, 0);

  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x), weight: w[i] }))
    .sort((a, b) => {
      const aPays = a.i === payerIndex ? 1 : 0;
      const bPays = b.i === payerIndex ? 1 : 0;
      if (aPays !== bPays) return sign > 0 ? bPays - aPays : aPays - bPays;
      if (b.frac !== a.frac) return b.frac - a.frac;
      if (b.weight !== a.weight) return b.weight - a.weight;
      return a.i - b.i;
    });

  for (let k = 0; left > 0; k++, left--) out[order[k % n].i] += 1;

  return out.map((c) => c * sign);
}

/**
 * Compute what each participant owes for a single bill.
 *
 * Items are split evenly among the people assigned to them. Each fee/adjustment
 * is then applied to the people it targets (default: everyone) — positive
 * amounts (service charge, tip) add to their share, negative amounts (PWD/senior
 * discounts) subtract — distributed proportionally to each target's item share,
 * so the diner with the discount actually pays less.
 *
 * Items nobody is on come back in `unassigned`. They still count toward the
 * bill's total — the restaurant charged for them — but there is no honest way
 * to split them, so the wizard refuses to advance while any exist rather than
 * silently billing them to nobody.
 *
 * @param {object} bill - { items:[{price, people:[id]}], fees:[{amount, people?:[id]}], participants:[id] }
 * @param {object} [opts] - { meId } the person who paid; takes the odd centavos.
 * @returns {{ dues, duesCents, itemsTotal, feesTotal, total, unassigned }}
 */
export function computeBillDues(bill, { meId = null } = {}) {
  const participants = bill?.participants || [];
  const items = bill?.items || [];
  const fees = bill?.fees || [];

  const index = new Map(participants.map((pId, i) => [pId, i]));
  const n = participants.length;
  const duesCentsArr = new Array(n).fill(0);

  let itemsCents = 0;
  let feesCents = 0;
  const unassigned = [];

  items.forEach((item) => {
    const cents = toCents(item?.price);
    itemsCents += cents;

    const sharers = (item?.people || []).filter((pId) => index.has(pId));
    if (sharers.length === 0) {
      unassigned.push(item);
      return;
    }

    const weights = sharers.map(() => 1);
    const payerSlot = sharers.indexOf(meId);
    allocateCents(cents, weights, payerSlot).forEach((c, k) => {
      duesCentsArr[index.get(sharers[k])] += c;
    });
  });

  // Snapshot the item-only shares so multiple fees don't compound each other.
  const itemShare = duesCentsArr.slice();

  fees.forEach((fee) => {
    const cents = toCents(fee?.amount);
    feesCents += cents;
    if (cents === 0) return;

    let targets = (fee?.people && fee.people.length)
      ? fee.people.filter((pId) => index.has(pId))
      : participants.slice();
    if (targets.length === 0) targets = participants.slice();
    if (targets.length === 0) return;

    const weights = targets.map((pId) => itemShare[index.get(pId)]);
    const payerSlot = targets.indexOf(meId);
    allocateCents(cents, weights, payerSlot).forEach((c, k) => {
      duesCentsArr[index.get(targets[k])] += c;
    });
  });

  const dues = {};
  const duesCents = {};
  participants.forEach((pId, i) => {
    duesCents[pId] = duesCentsArr[i];
    dues[pId] = fromCents(duesCentsArr[i]);
  });

  return {
    dues,
    duesCents,
    unassigned,
    itemsTotal: fromCents(itemsCents),
    feesTotal: fromCents(feesCents),
    total: fromCents(itemsCents + feesCents),
  };
}

/**
 * A bill with a `total` it can be trusted to keep.
 *
 * `logQuickSplit` shipped without one, so every "Split again" bill stored
 * `total: 0` and every screen — and every outbound message — read "came to
 * ₱0." above a list of real amounts. Deriving it here means no future caller
 * can reintroduce that by forgetting a field.
 */
export function withDerivedTotal(bill) {
  if (typeof bill?.total === 'number' && Number.isFinite(bill.total)) return bill;
  return { ...bill, total: computeBillDues(bill).total };
}
