// Ranks the splits you are most likely to be making right now, so a repeat
// of something you do often is a tap and a number instead of the full wizard.
//
// Three sources feed one list:
//   template  a split you deliberately saved, with its people already set
//   history   a split you have made before with the same people and name
//   time      a history entry that you usually make around now
//
// They share a shape so the UI never has to branch on where one came from.

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
      amounts: [], times: [], slots: [],
    };
    g.amounts.push(billTotal(bill));
    g.times.push(when);
    g.slots.push(slotOf(new Date(when)));
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

      return {
        kind: timely ? 'time' : 'history',
        id: `h:${g.key}`,
        title: g.title,
        people: g.people,
        amount: Math.round(median(g.amounts) * 100) / 100,
        count: g.times.length,
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
      const age = t.lastUsed ? (now - t.lastUsed) / DAY : 999;
      return {
        kind: 'template',
        id: `t:${t.id}`,
        templateId: t.id,
        title: t.title,
        people: ppl,
        amount: Number(t.amount) || 0,
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
