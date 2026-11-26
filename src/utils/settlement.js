// Who has paid for what.
//
// Payments aren't earmarked to a specific bill — a person just sends you a
// lump sum. To know which particular splits are actually settled (for the
// per-bill "who's paid" view, and to keep outbound messages from listing
// splits someone already covered), each person's lifetime payments are applied
// to their splits oldest-first: the natural reading of "pay off what you've
// owed longest."
//
// This lives outside the React store because it is the money logic, and money
// logic that can only be exercised by rendering a provider is money logic that
// never gets tested.

import { computeBillDues, SETTLED_EPSILON, toCents, fromCents } from './split.js';
import { sortBillsByDateAsc, sortBillsByDate } from './bills.js';

const EPS_CENTS = Math.round(SETTLED_EPSILON * 100); // 0 — a centavo is the real unit

/**
 * @param {object} a
 * @param {Array}  a.people   - [{ id, name }]
 * @param {Array}  a.bills    - stored bills
 * @param {Array}  a.payments - [{ id, personId, amount, date }]
 * @param {string} [a.meId]   - who paid, for the odd-centavo rule
 */
export function computeSettlement({ people = [], bills = [], payments = [], meId = null } = {}) {
  const balances = {};
  const personBillShares = {};
  const lifetimePayments = {};
  const paymentsByPerson = {};
  const credits = {};
  const billDuesById = {};
  // { [personId]: [{ bill, cents }] } — every share, including zero, oldest first.
  const duesByPerson = {};

  people.forEach((p) => {
    balances[p.id] = 0;
    personBillShares[p.id] = [];
    lifetimePayments[p.id] = 0;
    paymentsByPerson[p.id] = [];
    credits[p.id] = 0;
    duesByPerson[p.id] = [];
  });

  const oldestFirst = sortBillsByDateAsc(bills);
  const centsByBill = {};

  oldestFirst.forEach((bill) => {
    const { dues, duesCents } = computeBillDues(bill, { meId });
    billDuesById[bill.id] = dues;
    centsByBill[bill.id] = duesCents;
    Object.entries(duesCents).forEach(([pId, cents]) => {
      if (balances[pId] === undefined) return;
      balances[pId] += fromCents(cents);
      duesByPerson[pId].push({ bill, cents });
    });
  });

  // Lists on screen read newest first; the allocation above reads oldest first.
  sortBillsByDate(bills).forEach((bill) => {
    Object.entries(centsByBill[bill.id] || {}).forEach(([pId, cents]) => {
      if (personBillShares[pId] && cents > EPS_CENTS) {
        personBillShares[pId].push({ bill, amount: fromCents(cents) });
      }
    });
  });

  payments.forEach((pm) => {
    if (lifetimePayments[pm.personId] === undefined) return;
    lifetimePayments[pm.personId] += pm.amount;
    balances[pm.personId] -= pm.amount;
    paymentsByPerson[pm.personId].push(pm);
  });

  const billPersonStatus = {};   // { [billId]: { [personId]: { due, paid, remaining } } }
  const unpaidBillShares = {};   // { [personId]: [{ bill, amount, remaining }] }
  const settledBillShares = {};  // { [personId]: [{ bill, amount }] } newest first

  people.forEach((p) => {
    unpaidBillShares[p.id] = [];
    settledBillShares[p.id] = [];

    let pool = toCents(lifetimePayments[p.id] || 0);
    duesByPerson[p.id].forEach(({ bill, cents }) => {
      const applied = cents > 0 ? Math.min(pool, cents) : 0;
      pool = Math.max(0, pool - applied);
      const remaining = Math.max(0, cents - applied);

      if (!billPersonStatus[bill.id]) billPersonStatus[bill.id] = {};
      billPersonStatus[bill.id][p.id] = {
        due: fromCents(cents),
        paid: fromCents(applied),
        remaining: fromCents(remaining),
      };

      if (remaining > EPS_CENTS) {
        unpaidBillShares[p.id].push({ bill, amount: fromCents(cents), remaining: fromCents(remaining) });
      } else if (cents > EPS_CENTS) {
        settledBillShares[p.id].unshift({ bill, amount: fromCents(cents) });
      }
    });

    // Money they have sent that no split claims. Without this it is only ever
    // visible as a negative balance, which every "do they owe me?" check
    // filters out — so an overpayment disappears the moment it happens.
    credits[p.id] = fromCents(pool);
  });

  return {
    balances,
    personBillShares,
    lifetimePayments,
    paymentsByPerson,
    credits,
    billDuesById,
    billPersonStatus,
    unpaidBillShares,
    settledBillShares,
  };
}

/**
 * The payments that should survive deleting one bill.
 *
 * A deleted bill's payments used to stay in the person's pool and silently
 * credit their *next* split: delete a duplicate ₱500 someone already paid and
 * their ₱500 pays off the ₱400 dinner instead, their row reads "settled", and
 * the collection rate reports 100% while you are ₱400 down. So the amount that
 * was allocated to the deleted bill comes back out of their payments,
 * oldest-first, and anything beyond it stays theirs.
 *
 * @returns {Array} a new payments array (the input is never mutated)
 */
export function paymentsWithoutBill({ bills = [], payments = [], billId, meId = null } = {}) {
  if (!bills.some((b) => b?.id === billId)) return payments;

  const byPerson = new Map();
  payments.forEach((pm) => {
    if (!byPerson.has(pm.personId)) byPerson.set(pm.personId, []);
    byPerson.get(pm.personId).push(pm);
  });

  // How much of each person's money the deleted bill had absorbed.
  const reclaim = new Map();
  byPerson.forEach((list, personId) => {
    let pool = list.reduce((sum, pm) => sum + toCents(pm.amount), 0);
    sortBillsByDateAsc(bills).forEach((bill) => {
      const cents = computeBillDues(bill, { meId }).duesCents[personId] || 0;
      const applied = cents > 0 ? Math.min(pool, cents) : 0;
      pool -= applied;
      if (bill.id === billId) reclaim.set(personId, applied);
    });
  });

  const takenFrom = new Map();
  const out = [];
  // Oldest payment first: the oldest money is the money that paid the oldest
  // split, which is the one being deleted more often than not.
  const ordered = [...payments].sort(
    (a, b) => (Date.parse(a?.date) || 0) - (Date.parse(b?.date) || 0),
  );

  ordered.forEach((pm) => {
    let left = reclaim.get(pm.personId) || 0;
    left -= takenFrom.get(pm.personId) || 0;
    if (left <= 0) { out.push(pm); return; }

    const cents = toCents(pm.amount);
    const take = Math.min(cents, left);
    takenFrom.set(pm.personId, (takenFrom.get(pm.personId) || 0) + take);
    if (cents - take > 0) out.push({ ...pm, amount: fromCents(cents - take) });
  });

  // Preserve the caller's original payment order for anything untouched.
  const keptById = new Map(out.map((pm) => [pm.id, pm]));
  return payments.filter((pm) => keptById.has(pm.id)).map((pm) => keptById.get(pm.id));
}
