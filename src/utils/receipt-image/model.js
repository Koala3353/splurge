/**
 * The receipt model — what goes on a shareable image, and what does not.
 *
 * This file is the privacy boundary. `planReceipt` downstream draws exactly
 * what it is handed and asks no questions, so the decision about what a group
 * chat gets to see is made once, here, where it can be read in one sitting.
 *
 * The rules:
 *
 *   1. First names only. The per-person breakdown is the whole point of the
 *      image, so names stay — but a surname on a picture that gets forwarded
 *      out of the group is more than the text message ever carried, and the
 *      people in the chat already know which Ana this is.
 *   2. The saved payment number is off by default and is never implied. It is
 *      a live account identifier; an image is forwardable, screenshot-able and
 *      permanent in a way a pasted message is not. The caller must opt in per
 *      send, and the share sheet only offers the opt-in when the text message
 *      would have carried the number too.
 *   3. Nothing else identifying. No note of who shared which item, no payment
 *      history, no phone numbers, no app account.
 *
 * Everything money-shaped goes through format.js, so the currency sign is
 * whatever the user picked and never a hardcoded one.
 */
import { formatCurrency, formatDate } from '../format.js';
import { isSettled } from '../split.js';

const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * "Ana Cruz" → "Ana". The store writes "me" for the current user, which is
 * right in a sentence and wrong as a column label.
 */
export function firstNameOf(name) {
  const raw = (name ?? '').toString().trim();
  if (!raw) return 'Someone';
  if (raw.toLowerCase() === 'me') return 'You';
  return raw.split(/\s+/)[0];
}

/**
 * Turn a stored bill into the thing the renderer draws.
 *
 * @param {object}   a
 * @param {object}   a.bill            - { title, date, items, fees, participants }
 * @param {object}   a.dues            - personId => amount, from computeBillDues
 * @param {Function} a.nameOf          - personId => display name
 * @param {string}   [a.meId]
 * @param {object}   [a.payInfo]       - { method, number }
 * @param {boolean}  [a.includePayInfo] - opt-in, per send. Never defaulted on.
 * @param {number}   [a.total]         - the bill's own total, if it has one
 */
export function buildReceipt({
  bill,
  dues = {},
  nameOf = (id) => id,
  meId = null,
  payInfo = null,
  includePayInfo = false,
  total,
}) {
  const items = (bill?.items || []).map((item) => ({
    name: (item?.name || '').trim() || 'Item',
    figure: formatCurrency(num(item?.price)),
  }));

  const fees = (bill?.fees || [])
    .filter((fee) => num(fee?.amount) !== 0)
    .map((fee) => ({
      name: (fee?.name || '').trim() || (num(fee.amount) < 0 ? 'Discount' : 'Charge'),
      figure: formatCurrency(num(fee?.amount)),
    }));

  const itemsTotal = (bill?.items || []).reduce((sum, it) => sum + num(it?.price), 0);
  const billTotal = Number.isFinite(total)
    ? total
    : Number.isFinite(bill?.total)
      ? bill.total
      : itemsTotal + (bill?.fees || []).reduce((sum, f) => sum + num(f?.amount), 0);

  const people = (bill?.participants || []).map((id) => {
    const amount = num(dues[id]);
    return {
      // Rule 1 — first names only.
      name: id === meId ? 'You' : firstNameOf(nameOf(id)),
      figure: formatCurrency(amount),
      // Money is ink until it has a state. A zero share is settled and reads
      // in --ledger; nothing else on the image is coloured.
      settled: isSettled(amount),
    };
  });

  // Rule 2 — opt-in only, and only when there is something to show.
  const payLine = includePayInfo && payInfo?.number
    ? `${payInfo.method || 'GCash'} ${payInfo.number}`
    : null;

  return {
    title: (bill?.title || '').trim() || 'Split',
    date: formatDate(bill?.date) || '',
    items,
    fees,
    subtotal: fees.length ? formatCurrency(itemsTotal) : null,
    total: formatCurrency(billTotal),
    people,
    payLine,
  };
}
