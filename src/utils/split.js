// Single source of truth for bill-splitting math.
// Used by the app store (to compute balances), the New Bill review screen, and
// the bill detail view, so the numbers always agree.

const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Compute what each participant owes for a single bill.
 *
 * Items are split evenly among the people assigned to them. Each fee/adjustment
 * is then applied to the people it targets (default: everyone) — positive
 * amounts (service charge, tip) add to their share, negative amounts (PWD/senior
 * discounts) subtract — distributed proportionally to each target's item share,
 * so the diner with the discount actually pays less.
 *
 * @param {object} bill - { items:[{price, people:[id]}], fees:[{amount, people?:[id]}], participants:[id] }
 * @returns {{ dues: Record<string, number>, itemsTotal, feesTotal, total }}
 */
export function computeBillDues(bill) {
  const participants = bill?.participants || [];
  const items = bill?.items || [];
  const fees = bill?.fees || [];

  const dues = {};
  participants.forEach((pId) => { dues[pId] = 0; });

  const itemsTotal = items.reduce((sum, it) => sum + num(it.price), 0);
  const feesTotal = fees.reduce((sum, f) => sum + num(f.amount), 0);

  // Split each item evenly among the people assigned to it.
  items.forEach((item) => {
    const sharers = (item.people || []).filter((pId) => dues[pId] !== undefined);
    if (sharers.length === 0) return;
    const split = num(item.price) / sharers.length;
    sharers.forEach((pId) => { dues[pId] += split; });
  });

  // Allocate each fee to its target people, proportional to their item share
  // (snapshot the item-only shares so multiple fees don't compound each other).
  const itemShare = { ...dues };
  fees.forEach((fee) => {
    const amount = num(fee.amount);
    if (amount === 0) return;
    let targets = (fee.people && fee.people.length)
      ? fee.people.filter((pId) => dues[pId] !== undefined)
      : participants.slice();
    if (targets.length === 0) targets = participants.slice();
    if (targets.length === 0) return;

    const base = targets.reduce((sum, pId) => sum + itemShare[pId], 0);
    if (base > 0) {
      targets.forEach((pId) => { dues[pId] += amount * (itemShare[pId] / base); });
    } else {
      const even = amount / targets.length;
      targets.forEach((pId) => { dues[pId] += even; });
    }
  });

  return { dues, itemsTotal, feesTotal, total: itemsTotal + feesTotal };
}
