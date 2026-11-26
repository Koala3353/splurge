// Derived figures for the Stats page. Pure and dependency-free so each one
// can be pinned by a test — a number shown next to someone's name is the kind
// of thing nobody double-checks, so it has to be right the first time.

import { formatMonthShort } from './format.js';
import { SETTLED_EPSILON, withDerivedTotal } from './split.js';
import { computeSettlement } from './settlement.js';
import { billTime } from './bills.js';

const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

// Same derivation the store uses, so an old bill with no stored total can
// never read differently here than it does on Home.
const billTotal = (bill) => withDerivedTotal(bill).total;

const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/**
 * What you split each month, most recent last. Empty months are included
 * rather than skipped — a gap in the middle of a chart is information, and
 * collapsing it would make a quiet month look like a busy one.
 */
export function monthlySpend(bills = [], { months = 6, now = Date.now() } = {}) {
  const end = new Date(now);
  const buckets = [];
  const index = new Map();

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(end.getFullYear(), end.getMonth() - i, 1);
    const row = {
      key: monthKey(d),
      label: formatMonthShort(d),
      total: 0,
      count: 0,
    };
    buckets.push(row);
    index.set(row.key, row);
  }

  for (const bill of bills) {
    const d = new Date(bill?.date || 0);
    if (Number.isNaN(d.getTime())) continue;
    const row = index.get(monthKey(d));
    if (!row) continue;
    row.total += billTotal(bill);
    row.count += 1;
  }

  const peak = buckets.reduce((m, b) => Math.max(m, b.total), 0);
  return buckets.map((b) => ({ ...b, pct: peak > 0 ? (b.total / peak) * 100 : 0 }));
}

/**
 * How much of what other people owed you has actually come back.
 *
 * Deliberately excludes your own share: you never owed yourself, so counting
 * it would quietly inflate the rate on every split you were part of — which
 * is every split.
 */
export function collectionRate({ balances = {}, lifetimePayments = {}, people = [], meId = null }) {
  let collected = 0;
  let outstanding = 0;

  for (const p of people) {
    if (p.id === meId) continue;
    collected += Math.max(0, num(lifetimePayments[p.id]));
    outstanding += Math.max(0, num(balances[p.id]));
  }

  const billed = collected + outstanding;
  return {
    collected,
    outstanding,
    billed,
    // No billing at all is not 0% collected — it is simply not a rate yet.
    rate: billed > SETTLED_EPSILON ? collected / billed : null,
  };
}

/**
 * Who you split with most. Counts splits, not pesos: the point is who you
 * actually go out with, which a single expensive holiday shouldn't decide.
 */
export function splitCompanions({ bills = [], people = [], meId = null, limit = 5 }) {
  const byId = new Map(people.map((p) => [p.id, p]));
  const counts = new Map();

  for (const bill of bills) {
    for (const id of bill?.participants || []) {
      if (id === meId || !byId.has(id)) continue;
      counts.set(id, (counts.get(id) || 0) + 1);
    }
  }

  const peak = Math.max(0, ...counts.values());
  return [...counts.entries()]
    .map(([id, count]) => ({
      person: byId.get(id),
      count,
      pct: peak > 0 ? (count / peak) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count || a.person.name.localeCompare(b.person.name))
    .slice(0, limit);
}

/* ===================================================================== *
 * Getting paid back — how long it takes, who is quickest, who you chase.
 *
 * A payment carries no bill id: someone just sends you a lump sum, and
 * `settlement.js` applies it to their splits oldest-first. So "how long did
 * Rafael take to pay for Friday dinner" is derived, never stored. The
 * derivation below replays the settlement at each payment date and watches
 * for the moment a share's remaining balance reaches zero — the allocation
 * rule itself is never restated here, only asked again with less money.
 * ===================================================================== */

/**
 * Settled splits a person needs before they may be ranked.
 *
 * Two people with one payment each is not a ranking, it is a coin toss with
 * names on it. The UI says who is being withheld and what it is waiting for.
 */
export const MIN_SETTLED_SPLITS = 3;

const DAY_MS = 86400000;

const median = (values) => {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const paymentTime = (pm) => {
  const t = Date.parse(pm?.date);
  return Number.isFinite(t) ? t : null;
};

/**
 * Every share one person owed on one bill, and the day it finished being owed.
 *
 * Returns `[{ bill, person, due, remaining, settled, settledAt, days }]`.
 *
 * - `settledAt` is the date of the payment that closed the share, derived by
 *   re-running `computeSettlement` with the payments made up to each date in
 *   turn. The FIFO rule lives in one file and stays there.
 * - A share closed by a payment with no usable date is `settled` with
 *   `days: null`: we know it came back, not how long it took, and a guess
 *   would be indistinguishable from a measurement on screen.
 * - A share settled before its bill's date (clock skew, a backdated entry)
 *   clamps to 0 days rather than reporting negative time.
 * - `meId` never appears: you cannot owe yourself. With no `meId` set, every
 *   bill's payer is still inside its own dues, so nothing here is trustworthy
 *   — callers check `needsSelfIdentity` and show the prompt instead.
 */
export function settleDurations({ bills = [], people = [], payments = [], meId = null } = {}) {
  const byPerson = new Map(people.map((p) => [p.id, p]));
  const byBill = new Map(bills.map((b) => [b?.id, b]));

  const undated = [];
  const dated = [];
  for (const pm of payments) {
    const t = paymentTime(pm);
    if (t === null) undated.push(pm);
    else dated.push({ pm, t });
  }
  dated.sort((a, b) => a.t - b.t);
  const stamps = [...new Set(dated.map((d) => d.t))];

  const settleAt = (upTo) => computeSettlement({
    people,
    bills,
    meId,
    payments: upTo === null
      ? undated
      : undated.concat(dated.filter((d) => d.t <= upTo).map((d) => d.pm)),
  });

  const records = new Map(); // `${billId}|${personId}` -> record
  const base = settleAt(null);

  for (const [billId, perPerson] of Object.entries(base.billPersonStatus)) {
    const bill = byBill.get(billId);
    if (!bill) continue;
    for (const [personId, status] of Object.entries(perPerson)) {
      if (personId === meId || !byPerson.has(personId)) continue;
      if (status.due <= SETTLED_EPSILON) continue;
      records.set(`${billId}|${personId}`, {
        bill,
        person: byPerson.get(personId),
        due: status.due,
        remaining: status.remaining,
        // Closed already, by money we cannot date. Settled, but not timed.
        settled: status.remaining <= SETTLED_EPSILON,
        settledAt: null,
        days: null,
      });
    }
  }

  for (const stamp of stamps) {
    const snapshot = settleAt(stamp);
    for (const [key, record] of records) {
      if (record.settled) continue;
      const [billId, personId] = key.split('|');
      const status = snapshot.billPersonStatus[billId]?.[personId];
      if (!status || status.remaining > SETTLED_EPSILON) continue;
      record.settled = true;
      record.settledAt = stamp;
      // Negative time is skew, not speed.
      record.days = Math.max(0, Math.round((stamp - billTime(record.bill)) / DAY_MS));
    }
  }

  const final = stamps.length > 0 ? settleAt(stamps[stamps.length - 1]) : base;
  for (const [key, record] of records) {
    const [billId, personId] = key.split('|');
    record.remaining = final.billPersonStatus[billId]?.[personId]?.remaining ?? record.remaining;
  }

  return [...records.values()];
}

/**
 * How long your money takes to come back, overall and per person.
 *
 * Medians, not averages: one friend who took nine months to pay back a
 * holiday should not move everybody else's figure.
 */
export function settleSpeed({ records = [], minSamples = MIN_SETTLED_SPLITS } = {}) {
  const timed = records.filter((r) => r.days !== null);

  const byPerson = new Map();
  for (const r of timed) {
    if (!byPerson.has(r.person.id)) byPerson.set(r.person.id, { person: r.person, days: [] });
    byPerson.get(r.person.id).days.push(r.days);
  }

  const rows = [...byPerson.values()].map(({ person, days }) => ({
    person,
    samples: days.length,
    medianDays: median(days),
    enough: days.length >= minSamples,
  }));

  return {
    minSamples,
    samples: timed.length,
    // One settled split is not "how long your money takes".
    medianDays: timed.length >= minSamples ? median(timed.map((r) => r.days)) : null,
    ranked: rows
      .filter((r) => r.enough)
      .sort((a, b) => a.medianDays - b.medianDays || a.person.name.localeCompare(b.person.name)),
    withheld: rows
      .filter((r) => !r.enough)
      .sort((a, b) => b.samples - a.samples || a.person.name.localeCompare(b.person.name)),
  };
}

/**
 * Who settles first when more than one person owes on the same split.
 *
 * Deliberately not the same signal as speed: someone can be consistently
 * first out of the gate on small splits and still be slow in absolute days,
 * and the person who is never first is the person you end up messaging.
 *
 * A bill only counts when at least two people owed on it and at least one of
 * them has a dated settlement — otherwise there is no race and no winner.
 * Everybody who owed on such a bill is counted as having been in it, so a
 * chronic non-payer accrues contests and no firsts, which is the truth.
 */
export function payOrder({ records = [], minSamples = MIN_SETTLED_SPLITS } = {}) {
  const byBill = new Map();
  for (const r of records) {
    if (!byBill.has(r.bill.id)) byBill.set(r.bill.id, []);
    byBill.get(r.bill.id).push(r);
  }

  const tally = new Map();
  const bump = (person, field) => {
    if (!tally.has(person.id)) tally.set(person.id, { person, firsts: 0, contests: 0 });
    tally.get(person.id)[field] += 1;
  };

  for (const group of byBill.values()) {
    if (group.length < 2) continue;
    const timed = group.filter((r) => r.settledAt !== null);
    if (timed.length === 0) continue;
    const first = Math.min(...timed.map((r) => r.settledAt));
    for (const r of group) {
      bump(r.person, 'contests');
      // A genuine tie — both paid the same day — counts for both.
      if (r.settledAt === first) bump(r.person, 'firsts');
    }
  }

  const rows = [...tally.values()].map((t) => ({
    ...t,
    rate: t.contests > 0 ? t.firsts / t.contests : 0,
    enough: t.contests >= minSamples,
  }));

  return {
    minSamples,
    ranked: rows
      .filter((r) => r.enough)
      .sort((a, b) => b.rate - a.rate || b.contests - a.contests
        || a.person.name.localeCompare(b.person.name)),
    withheld: rows
      .filter((r) => !r.enough)
      .sort((a, b) => b.contests - a.contests || a.person.name.localeCompare(b.person.name)),
  };
}

/**
 * Who you have to chase, ordered by how long you have been waiting.
 *
 * Age, not amount — the running tab already ranks by amount, and a small debt
 * from March is a different problem from a large one from last week. Someone
 * who has never paid anything has no settle time and so appears in no median;
 * this is the list they belong on.
 */
export function chaseList({ records = [], now = Date.now() } = {}) {
  const open = records.filter((r) => !r.settled && r.remaining > SETTLED_EPSILON);

  const byPerson = new Map();
  for (const r of open) {
    const age = Math.max(0, Math.round((now - billTime(r.bill)) / DAY_MS));
    const entry = byPerson.get(r.person.id) || {
      person: r.person, outstanding: 0, splits: 0, oldestDays: 0, oldestBill: null,
    };
    entry.outstanding += r.remaining;
    entry.splits += 1;
    if (entry.oldestBill === null || age > entry.oldestDays) {
      entry.oldestDays = age;
      entry.oldestBill = r.bill;
    }
    byPerson.set(r.person.id, entry);
  }

  const people = [...byPerson.values()].sort(
    (a, b) => b.oldestDays - a.oldestDays
      || b.outstanding - a.outstanding
      || a.person.name.localeCompare(b.person.name),
  );

  return { people, oldest: people[0] || null };
}

/**
 * Is your money coming back faster than it used to?
 *
 * Bucketed by the month of the *bill*, not of the payment: the question is
 * whether recent splits settle quicker, and a payment month would file a
 * nine-month-old debt under the month it finally closed.
 */
export function settleTrend({
  records = [], months = 6, now = Date.now(), minSamples = MIN_SETTLED_SPLITS,
} = {}) {
  const end = new Date(now);
  const buckets = [];
  const index = new Map();

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(end.getFullYear(), end.getMonth() - i, 1);
    const row = { key: monthKey(d), label: formatMonthShort(d), days: [] };
    buckets.push(row);
    index.set(row.key, row);
  }

  for (const r of records) {
    if (r.days === null) continue;
    const d = new Date(billTime(r.bill));
    const row = index.get(monthKey(d));
    if (!row) continue;
    row.days.push(r.days);
  }

  const rows = buckets.map((b) => ({
    key: b.key,
    label: b.label,
    samples: b.days.length,
    medianDays: b.days.length > 0 ? median(b.days) : null,
  }));

  const peak = rows.reduce((m, r) => Math.max(m, r.medianDays ?? 0), 0);
  const withPct = rows.map((r) => ({
    ...r,
    pct: peak > 0 && r.medianDays !== null ? (r.medianDays / peak) * 100 : 0,
  }));

  // Halve the window and compare, but only when both halves can carry it.
  const half = Math.floor(months / 2);
  const olderDays = buckets.slice(0, half).flatMap((b) => b.days);
  const recentDays = buckets.slice(half).flatMap((b) => b.days);
  const change = olderDays.length >= minSamples && recentDays.length >= minSamples
    ? {
      recentDays: median(recentDays),
      olderDays: median(olderDays),
      deltaDays: median(recentDays) - median(olderDays),
    }
    : null;

  return { months: withPct, change, minSamples };
}
