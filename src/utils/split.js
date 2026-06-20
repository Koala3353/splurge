// Single source of truth for bill-splitting math.
// Used by the app store (to compute balances), the New Bill review screen, and
// the bill detail view, so the numbers always agree.

const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Compute what each participant owes for a single bill, allocating shared
 * fees/tips/discounts proportionally to each person's item share.
 *
 * @param {object} bill - { items:[{price, people:[id]}], fees:[{amount}], participants:[id] }
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

  // Allocate fees (can be negative for discounts). Distribute by each person's
  // share of the assigned item cost; fall back to an even split when no items
  // are assigned yet.
  if (feesTotal !== 0) {
    const assigned = participants.reduce((sum, pId) => sum + dues[pId], 0);
    if (assigned > 0) {
      participants.forEach((pId) => {
        dues[pId] += feesTotal * (dues[pId] / assigned);
      });
    } else if (participants.length > 0) {
      const even = feesTotal / participants.length;
      participants.forEach((pId) => { dues[pId] += even; });
    }
  }

  return { dues, itemsTotal, feesTotal, total: itemsTotal + feesTotal };
}
