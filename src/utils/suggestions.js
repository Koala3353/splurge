// Ranks the splits you are most likely to be making right now, so a repeat
// of something you do often is a tap and a number instead of the full wizard.
//
// Three sources feed one list:
//   template  a split you deliberately saved, with its people already set
//   history   a split you have made before with the same people and name
//   time      a history entry that you usually make around now
//
// They share a shape so the UI never has to branch on where one came from.
//
// Every suggestion also says what repeating it means. `itemised` is inferred
// from the bill it would repeat, never asked: false means one amount shared
// evenly, which the quick-split sheet finishes in a tap; true means lines,
// prices and per-line assignments worth carrying over, and `sourceBillId`
// names the bill the wizard hydrates itself from.

import { readBackupNudges } from './nudges.js';

const DAY = 86400000;

// How long a habit stays interesting. At 21 days a past split counts for
// half of what it would have counted for yesterday — long enough that a
// fortnightly routine survives, short enough that last spring's holiday
// doesn't outrank this month's.
const HALF_LIFE_DAYS = 21;

const titleKey = (s) =>
  (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** A split is "the same split" when it names the same thing with the same people. */
const groupKey = (title, people) => `${titleKey(title)}|${[...people].sort().join(',')}`;

const median = (nums) => {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const billTotal = (bill) => {
  const items = (bill.items || []).reduce((n, i) => n + (Number(i.price) || 0), 0);
  const fees = (bill.fees || []).reduce((n, f) => n + (Number(f.amount) || 0), 0);
  return items + fees;
};

/**
 * Was this bill itemised, or was it one amount shared out evenly?
 *
 * Nobody is asked. The two shapes the app itself produces are distinguishable:
 * `logQuickSplit` and the wizard's even-split route both write exactly one
 * line, no fees, with everyone on it. Anything else — a second line, a fee or
 * a tip, or a single line that only some of the table are on — carries
 * per-item detail that a one-amount repeat would throw away.
 */
const isItemisedBill = (bill) => {
  const items = bill.items || [];
  const fees = bill.fees || [];
  if (items.length === 0) return false;
  if (items.length > 1 || fees.length > 0) return true;
  const participants = bill.participants || [];
  const on = items[0].people || [];
  return !participants.every((id) => on.includes(id));
};

// Weekday vs weekend, then morning / afternoon / evening. Coarse on purpose:
// "Friday evening" is a real habit, "Friday at 19:12" is noise.
const slotOf = (d) => {
  const weekend = d.getDay() === 0 || d.getDay() === 6;
  const h = d.getHours();
  const part = h < 11 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  return `${weekend ? 'weekend' : 'weekday'}-${part}`;
};

const SLOT_WORD = {
  'weekday-morning': 'weekday mornings',
  'weekday-afternoon': 'weekday afternoons',
  'weekday-evening': 'weekday evenings',
  'weekend-morning': 'weekend mornings',
  'weekend-afternoon': 'weekend afternoons',
  'weekend-evening': 'weekend evenings',
};

const agoWord = (ms) => {
  const d = Math.floor(ms / DAY);
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d} days ago`;
  if (d < 14) return 'last week';
  if (d < 60) return `${Math.round(d / 7)} weeks ago`;
  return `${Math.round(d / 30)} months ago`;
};

/**
 * What a tap on a suggestion does, said plainly on the control itself.
 *
 * The two kinds land in different places — one confirms an amount and is
 * done, the other opens the wizard on last time's lines — and that is too
 * big a difference to leave to a surprise. One line of copy is cheaper than
 * a "which kind?" prompt, and the app already knows the answer.
 */
export function repeatLabel(suggestion) {
  if (!suggestion) return '';
  const { itemised, lines = 0, people = [] } = suggestion;
  if (itemised) {
    return `${lines} ${lines === 1 ? 'line' : 'lines'} to check`;
  }
  return `One amount, ${people.length} ${people.length === 1 ? 'way' : 'ways'}`;
}

/* ------------------------------------------------------------------ *
 * Cadence — a saved split that knows roughly when it comes round again
 * ------------------------------------------------------------------ */

/**
 * A recurring split is a template with a cadence on it. Deliberately not a
 * second kind of object: templates already carry a name, a crew, a typical
 * amount and a `lastUsed`, which is every field a cadence needs, and they are
 * already ranked, already persisted and already in the backup.
 *
 * `none` is a real answer with its own entry rather than the absence of one —
 * a split you want handy but not nagged about is the common case.
 */
export const CADENCES = [
  { id: 'none', label: 'No reminder', days: 0 },
  { id: 'weekly', label: 'Every week', days: 7 },
  { id: 'fortnightly', label: 'Every 2 weeks', days: 14 },
  { id: 'monthly', label: 'Every month', days: 0 },
];

export const cadenceOf = (id) => CADENCES.find((c) => c.id === id) || CADENCES[0];

/** Same day-of-month next month, clamped — the 31st of January is 28 Feb. */
function addMonth(ms) {
  const d = new Date(ms);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d.getTime();
}

/**
 * When this split comes round again, or null if it never does.
 *
 * The clock runs from the last time the split was actually made, not from
 * when the reminder was set up: a rent split logged four days late moves the
 * next one four days later too, which is what the user did rather than what
 * they once said they would do.
 */
export function nextDueAt(tpl) {
  const cad = cadenceOf(tpl?.cadence);
  if (cad.id === 'none') return null;
  const anchor = tpl.lastUsed || tpl.createdAt || null;
  if (!anchor) return null;
  if (cad.id === 'monthly') return addMonth(anchor);
  return anchor + cad.days * DAY;
}

/**
 * The saved splits that have come round, most overdue first.
 *
 * **These are offered, never created.** The prompt names the split and asks
 * for an amount; nothing is written until the user confirms one. A bill the
 * app invented is a debt a friend never agreed to and a balance the user
 * cannot explain, and no amount of convenience pays for that.
 *
 * `snoozedUntil` is what "Not now" writes, so dismissing one costs a tap
 * rather than deleting the reminder.
 */
export function dueTemplates({ templates = [], people = [], now = Date.now() } = {}) {
  const known = new Set(people.map((p) => p.id));

  return templates
    .map((t) => {
      const crew = (t.people || []).filter((id) => known.has(id));
      if (crew.length === 0) return null;
      const dueAt = nextDueAt(t);
      if (dueAt === null || dueAt > now) return null;
      if (t.snoozedUntil && t.snoozedUntil > now) return null;
      const label = cadenceOf(t.cadence).label;
      const late = now - dueAt;
      return {
        id: t.id,
        templateId: t.id,
        title: t.title,
        people: crew,
        amount: Number(t.amount) || 0,
        cadence: t.cadence,
        dueAt,
        reason: late < DAY ? `${label} · due today` : `${label} · due ${agoWord(late)}`,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.dueAt - b.dueAt);
}

const isDueNow = (t, now) => {
  const dueAt = nextDueAt(t);
  if (dueAt === null || dueAt > now) return false;
  return !(t.snoozedUntil && t.snoozedUntil > now);
};

/* ------------------------------------------------------------------ *
 * Reading these fields back out of a backup
 * ------------------------------------------------------------------ */

/**
 * Fills a saved split out to the shape the cadence code expects.
 *
 * A template written before cadences existed — any version-1, -2 or -3
 * backup — has none of these fields. Rather than have `nextDueAt` and every
 * caller defend against that, a restore passes each one through here once.
 * A missing cadence reads as 'none': a backup cannot be made to start
 * prompting somebody about a split they never set a reminder on.
 */
export function normaliseTemplate(t = {}) {
  const num = (v) => (Number.isFinite(v) ? v : null);
  return {
    ...t,
    cadence: typeof t.cadence === 'string' ? t.cadence : 'none',
    createdAt: num(t.createdAt),
    snoozedUntil: num(t.snoozedUntil),
    lastUsed: num(t.lastUsed),
  };
}

/**
 * The fields later versions added, read out of a backup file of any version.
 *
 * `templates`, `usual` and `lastTipPct` are absent from a version-3 backup
 * and earlier; `nudges` — when each person was last reminded — is absent from
 * version 4 and earlier. Each resolves to the same thing it would be on a
 * fresh install: no saved cadences, no usual crew, no remembered tip, and
 * nobody ever chased. Restoring an old file is therefore lossless in the only
 * direction that matters — it can remove these settings, never invent them,
 * and a reminder history in particular must never be invented, because a
 * fabricated "reminded yesterday" talks the user out of a message they have
 * not actually sent.
 */
export function readBackupExtras(data = {}) {
  return {
    templates: (Array.isArray(data.templates) ? data.templates : []).map(normaliseTemplate),
    usual: data.usual && typeof data.usual === 'object' && !Array.isArray(data.usual)
      ? data.usual
      : null,
    lastTipPct: Number.isFinite(data.lastTipPct) ? data.lastTipPct : 0,
    nudges: readBackupNudges(data),
  };
}

/**
 * Who a new split starts with, resolved from the stored reference.
 *
 * Stored as `{ kind, id }` rather than a list of people, so a crew that
 * gains a flatmate starts the next split with the flatmate on it. A
 * reference to somebody deleted since resolves to nobody at all — never to
 * a partial or a wrong crew — which is what lets the wizard open empty
 * instead of pre-selecting the wrong person.
 */
export function resolveUsual({ usual, people = [], groups = [] } = {}) {
  const none = { ids: [], label: '', kind: null };
  if (!usual) return none;
  if (usual.kind === 'group') {
    const g = groups.find((x) => x.id === usual.id);
    if (!g) return none;
    const ids = (g.peopleIds || []).filter((id) => people.some((p) => p.id === id));
    return ids.length ? { ids, label: g.name, kind: 'group' } : none;
  }
  const person = people.find((p) => p.id === usual.id);
  return person ? { ids: [person.id], label: person.name, kind: 'person' } : none;
}

/* ------------------------------------------------------------------ *
 * Who you actually split with
 * ------------------------------------------------------------------ */

/**
 * The people picker, ordered by how often you really split with each person,
 * so the two or three you always pick are reachable without a scroll.
 *
 * Deliberately **not** recency- or time-weighted, unlike the suggestion
 * ranking above. A picker whose order moves between visits costs more than it
 * saves: you reach for where the name was last time and tap the wrong person.
 * A plain count moves only when you make a split, and a tie falls back to the
 * name so the order is total rather than whatever the sort engine does.
 */
export function rankPeopleBySplits({ people = [], bills = [] } = {}) {
  const counts = new Map();
  for (const bill of bills) {
    for (const id of new Set(bill.participants || [])) {
      counts.set(id, (counts.get(id) || 0) + 1);
    }
  }
  return [...people].sort((a, b) => (
    (counts.get(b.id) || 0) - (counts.get(a.id) || 0)
    || (a.name || '').localeCompare(b.name || '')
  ));
}

/**
 * @param {object}   input
 * @param {Array}    input.bills       every past bill
 * @param {Array}    input.templates   saved templates
 * @param {Array}    input.people      so suggestions naming deleted people drop out
 * @param {string?}  input.meId
 * @param {number}   input.now         ms; injected so this is testable
 * @param {number}   input.limit
 * @returns {Array} ranked suggestions
 */
export function buildSuggestions({
  bills = [],
  templates = [],
  people = [],
  meId = null,
  now = Date.now(),
  limit = 6,
} = {}) {
  const known = new Set(people.map((p) => p.id));
  const nowSlot = slotOf(new Date(now));

  // --- history ---------------------------------------------------------
  const groups = new Map();
  for (const bill of bills) {
    const participants = (bill.participants || []).filter((id) => known.has(id));
    // A split with nobody but you in it is a note, not a thing to repeat.
    if (participants.filter((id) => id !== meId).length === 0) continue;

    const when = new Date(bill.date || 0).getTime();
    if (!Number.isFinite(when) || when > now) continue;

    const key = groupKey(bill.title, participants);
    const g = groups.get(key) || {
      key, title: bill.title, people: participants,
      amounts: [], times: [], slots: [], sources: [],
    };
    g.amounts.push(billTotal(bill));
    g.times.push(when);
    g.slots.push(slotOf(new Date(when)));
    g.sources.push({
      id: bill.id,
      when,
      itemised: isItemisedBill(bill),
      lines: (bill.items || []).length,
    });
    // Keep the most recent spelling of the title — names get tidied over time.
    if (when >= Math.max(...g.times)) g.title = bill.title;
    groups.set(key, g);
  }

  const history = [...groups.values()]
    .filter((g) => g.times.length >= 2) // once is not a habit
    .map((g) => {
      const last = Math.max(...g.times);
      const ageDays = (now - last) / DAY;
      const recency = 0.5 ** (ageDays / HALF_LIFE_DAYS);
      // Square root, so ten past dinners don't bury three past groceries.
      const frequency = Math.sqrt(g.times.length);
      const matching = g.slots.filter((s) => s === nowSlot).length;
      const affinity = matching / g.slots.length;
      // A habit that matches the current slot is worth surfacing even when
      // something else is more recent — that is the whole point of knowing
      // the time. It cannot invent a habit from nothing, only reorder.
      const timely = affinity >= 0.5 && matching >= 2;

      // The bill this suggestion would repeat: the most recent one in the
      // group. An order drifts — a dish comes off the menu, a price goes up,
      // somebody stops drinking — and the last trip is the closest thing to
      // the next one. Taking the *typical* bill instead would average away
      // exactly the changes the user has already made. The amount stays the
      // median, because one blowout should not become the expected price.
      const source = g.sources.reduce((a, b) => (b.when >= a.when ? b : a));

      return {
        kind: timely ? 'time' : 'history',
        id: `h:${g.key}`,
        title: g.title,
        people: g.people,
        amount: Math.round(median(g.amounts) * 100) / 100,
        count: g.times.length,
        itemised: source.itemised,
        sourceBillId: source.id,
        lines: source.itemised ? source.lines : 0,
        lastUsed: last,
        reason: timely
          ? `You usually split this on ${SLOT_WORD[nowSlot]}`
          : `${g.times.length}× · last ${agoWord(now - last)}`,
        score: frequency * recency * (1 + (timely ? 0.85 : affinity * 0.3)),
      };
    });

  // --- templates -------------------------------------------------------
  // Deliberately saved, so they rank above anything merely inferred — but
  // still among themselves by how recently they were used.
  const tpl = templates
    .map((t) => {
      const ppl = (t.people || []).filter((id) => known.has(id));
      if (ppl.length === 0) return null;
      // A split that has come round is carried by the due prompt, which asks
      // for an amount and says why it is there. Leaving it here as well would
      // put the same split on the same screen twice, under two different
      // affordances, one of which looks like it means something else.
      if (isDueNow(t, now)) return null;
      const age = t.lastUsed ? (now - t.lastUsed) / DAY : 999;
      return {
        kind: 'template',
        id: `t:${t.id}`,
        templateId: t.id,
        title: t.title,
        people: ppl,
        amount: Number(t.amount) || 0,
        // A template is a name, a crew and an amount — there are no lines in
        // it to repeat, so it is always the one-amount kind.
        itemised: false,
        sourceBillId: null,
        lines: 0,
        lastUsed: t.lastUsed || 0,
        reason: t.lastUsed ? `Saved · last ${agoWord(now - t.lastUsed)}` : 'Saved',
        score: 100 + 0.5 ** (age / HALF_LIFE_DAYS),
      };
    })
    .filter(Boolean);

  // A template and a history entry for the same thing are the same suggestion;
  // the template wins because it was chosen rather than guessed.
  const taken = new Set(tpl.map((t) => groupKey(t.title, t.people)));

  return [...tpl, ...history.filter((h) => !taken.has(h.id.slice(2)))]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
