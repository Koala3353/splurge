// Every string here gets pasted into a real group chat, so the voice stays
// plain: no app signature, no filler pleasantries, no em-dash asides. Read each
// one back as if a friend typed it on their phone — if it sounds composed, it's
// wrong. Shape comes from the share sheet's options, which persist between sends.
//
// One rule drives most of the wording below: the reader has no app and no
// context. Every number has to say what it is, because a bare "₱800 (₱205 paid)"
// reads as if the ₱205 were still inside the ₱800 when it has already come off.

import { formatCurrency } from './format';

export const DEFAULT_SHARE_OPTIONS = {
  detail: 'bills',      // 'summary' (totals only) | 'bills' (per split) | 'items' (per line)
  showDates: false,     // date each split happened
  showSharers: false,   // who else was on each item (items detail only)
  showPaid: false,      // spell out the running total so the balance is unambiguous
  showHistory: false,   // list splits they've already covered
  showPayInfo: true,    // your GCash/Maya number
  greeting: true,       // open with their name
};

const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

// Chat reads better without trailing centavos on whole amounts: ₱575, not
// ₱575.00. Anything with real centavos keeps them.
const money = (n) => {
  const s = formatCurrency(Math.max(0, num(n)));
  return s.endsWith('.00') ? s.slice(0, -3) : s;
};

const upperFirst = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// Blocks are separated by a blank line; falsy blocks drop out entirely.
const joinBlocks = (blocks) => blocks.filter(Boolean).join('\n\n');

const withDefaults = (options) => ({ ...DEFAULT_SHARE_OPTIONS, ...(options || {}) });

// "Rafael and Jericho" — how a person would actually write a short list.
function listOf(names) {
  if (names.length <= 1) return names[0] || '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// Short enough to sit in parentheses; the year only appears when it isn't this one.
function shortDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-PH', sameYear
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' });
}

// "Friday dinner (Aug 12)" when dates are on.
function billLabel(bill, o) {
  const when = o.showDates ? shortDate(bill?.date) : '';
  return when ? `${bill.title} (${when})` : bill?.title || 'Split';
}

// The one line friends actually need in order to pay you.
function payLine(payInfo, options) {
  if (!options.showPayInfo || !payInfo?.number) return null;
  return `${payInfo.method || 'GCash'} ${payInfo.number}`;
}

// A person's cut of each item they were tagged on, indented under its split.
function itemLines(bill, personId, o, nameOf) {
  return (bill?.items || [])
    .filter((it) => (it.people || []).includes(personId))
    .map((it) => {
      const people = it.people || [];
      const sharers = people.length || 1;
      let row = `  ${it.name || 'Item'}: ${money(num(it.price) / sharers)}`;
      if (o.showSharers && sharers > 1 && nameOf) {
        const others = people.filter((id) => id !== personId).map(nameOf).filter(Boolean);
        if (others.length) row += ` (split with ${listOf(others)})`;
      }
      return row;
    });
}

/**
 * A 1:1 nudge for one person's outstanding balance.
 *
 * @param {object}   a
 * @param {object}   a.person    - { id, name }
 * @param {number}   a.amount    - what they still owe, already net of payments
 * @param {Array}    a.unpaid    - [{ bill, remaining }] still outstanding
 * @param {Array}    a.settled   - [{ bill, amount }] already covered
 * @param {number}   a.paidTotal - lifetime amount they've paid you
 * @param {Function} a.nameOf    - personId => display name, for "split with"
 */
export function buildPersonRequest({
  person, amount, unpaid = [], settled = [], paidTotal = 0, nameOf, payInfo, options,
}) {
  const o = withDefaults(options);
  const name = person?.name || 'there';

  if (num(amount) <= 0.005) {
    return o.greeting ? `Hey ${name}, you're all settled up.` : "You're all settled up.";
  }

  const count = unpaid.length;
  // With a single split, naming it in the opener beats a one-row list below.
  const namesTheSplit = count === 1 && o.detail === 'bills';

  // Only cite the split count when the list below actually backs it up.
  const lead = namesTheSplit
    ? `your share for ${billLabel(unpaid[0].bill, o)} is ${money(unpaid[0].remaining)}`
    : o.detail !== 'summary' && count > 1
      ? `you're at ${money(amount)} across ${count} splits`
      : `you're at ${money(amount)}`;

  const blocks = [o.greeting ? `Hey ${name}, ${lead}.` : `${upperFirst(lead)}.`];

  if (o.detail !== 'summary' && count > 0 && !namesTheSplit) {
    blocks.push(unpaid.map((s) => {
      const row = `${billLabel(s.bill, o)}: ${money(s.remaining)}`;
      if (o.detail !== 'items') return row;
      return [row, ...itemLines(s.bill, person?.id, o, nameOf)].join('\n');
    }).join('\n'));
  }

  // Says plainly that the balance above is already net, which a bare
  // "paid: ₱205" line does not.
  if (o.showPaid && num(paidTotal) > 0.005) {
    blocks.push(`That's after the ${money(paidTotal)} you already sent.`);
  }

  if (o.showHistory && settled.length > 0) {
    blocks.push([
      'Already covered:',
      ...settled.map((s) => `${billLabel(s.bill, o)}: ${money(s.amount)}`),
    ].join('\n'));
  }

  return joinBlocks([...blocks, payLine(payInfo, o)]);
}

/**
 * One combined nudge for everyone still owing — meant to be posted once into a
 * group chat rather than sent person by person.
 *
 * @param {Array} a.rows - [{ name, amount, paid }] sorted biggest first, where
 *                         `amount` is already net of `paid`
 */
export function buildGroupReminder({ rows = [], label, payInfo, options }) {
  const o = withDefaults(options);

  if (rows.length === 0) {
    return label ? `Everyone in ${label} is settled up.` : "Everyone's settled up.";
  }

  const total = rows.reduce((sum, r) => sum + num(r.amount), 0);
  const lines = rows.map((r) => {
    // "₱800 left of ₱1,005" can only be read one way; "₱800 (₱205 paid)" cannot.
    if (o.showPaid && num(r.paid) > 0.005) {
      return `${r.name}: ${money(r.amount)} left of ${money(num(r.amount) + num(r.paid))}`;
    }
    return `${r.name}: ${money(r.amount)}`;
  });

  return joinBlocks([
    label ? `${label}, where we're at:` : "Where we're at:",
    lines.join('\n'),
    rows.length > 1 ? `Total: ${money(total)}` : null,
    payLine(payInfo, o),
  ]);
}

/**
 * The full split for one bill: what it cost and who owes what.
 *
 * @param {Function} a.nameOf - personId => display name
 */
export function buildBillBreakdown({ bill, dues = {}, nameOf, payInfo, options }) {
  const o = withDefaults(options);
  if (!bill) return '';

  const rows = (bill.participants || [])
    .map((pId) => ({ name: nameOf(pId), amount: num(dues[pId]) }))
    .filter((r) => r.amount > 0.005)
    .sort((a, b) => b.amount - a.amount);

  const items = o.detail === 'items'
    ? (bill.items || []).map((it) => {
      let row = `${it.name || 'Item'}: ${money(it.price)}`;
      if (o.showSharers && (it.people || []).length) {
        const on = it.people.map(nameOf).filter(Boolean);
        if (on.length) row += ` (${listOf(on)})`;
      }
      return row;
    })
    : [];

  return joinBlocks([
    `${billLabel(bill, o)}, ${money(bill.total)}`,
    items.length ? items.join('\n') : null,
    rows.length
      ? [items.length ? 'The split:' : null,
        // Inline, the organizer reads as "me"; starting a row, "Me".
        ...rows.map((r) => `${upperFirst(r.name)}: ${money(r.amount)}`)]
        .filter(Boolean).join('\n')
      : null,
    payLine(payInfo, o),
  ]);
}

/**
 * Who has settled this bill and who hasn't. The account owner is left out —
 * like every outward-facing message here, it shouldn't list the organizer as
 * someone who "owes."
 *
 * @param {object} a.statusByPerson - { [personId]: { due, paid, remaining } }
 */
export function buildPaymentStatus({ bill, statusByPerson = {}, nameOf, meId, payInfo, options }) {
  const o = withDefaults(options);
  if (!bill) return '';

  const rows = (bill.participants || [])
    .filter((pId) => pId !== meId)
    .map((pId) => {
      const st = statusByPerson[pId];
      const due = num(st?.due);
      const remaining = Math.max(0, st?.remaining ?? due);
      return { name: nameOf(pId), due, remaining, isPaid: remaining <= 0.005 };
    })
    .filter((r) => r.due > 0.005);

  const paid = rows.filter((r) => r.isPaid);
  const unpaid = rows.filter((r) => !r.isPaid).sort((a, b) => b.remaining - a.remaining);

  if (unpaid.length === 0) {
    return `${billLabel(bill, o)}: everyone's settled up.`;
  }

  const lines = unpaid.map((r) => (
    // Part-payers get the same "left of" treatment, for the same reason.
    o.showPaid && r.remaining < r.due - 0.005
      ? `${r.name}: ${money(r.remaining)} left of ${money(r.due)}`
      : `${r.name}: ${money(r.remaining)}`
  ));

  return joinBlocks([
    `${billLabel(bill, o)}, still open:`,
    lines.join('\n'),
    o.showPaid && paid.length ? `Fully paid: ${listOf(paid.map((r) => r.name))}` : null,
    payLine(payInfo, o),
  ]);
}
