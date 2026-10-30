// Derived figures for the Stats page. Pure and dependency-free so each one
// can be pinned by a test — a number shown next to someone's name is the kind
// of thing nobody double-checks, so it has to be right the first time.

const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

const billTotal = (bill) => {
  if (Number.isFinite(bill?.total)) return bill.total;
  const items = (bill?.items || []).reduce((n, i) => n + num(i.price), 0);
  const fees = (bill?.fees || []).reduce((n, f) => n + num(f.amount), 0);
  return items + fees;
};

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
      label: d.toLocaleDateString('en-PH', { month: 'short' }),
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
    rate: billed > 0.005 ? collected / billed : null,
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
