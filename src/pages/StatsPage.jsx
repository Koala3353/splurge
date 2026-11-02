import { useState, useMemo } from 'react';
import { monthlySpend, collectionRate, splitCompanions } from '../utils/stats';
import { useAppContext } from '../store/AppContext';
import { useCountUp } from '../hooks/useCountUp';
import { formatCurrency, formatCompact, formatDate, initialsOf } from '../utils/format';
import {
  Wallet,
  ArrowUpRight,
  Award,
  Receipt,
  HandCoins,
  ChevronDown,
  BarChart3,
  Users,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// A single headline stat. `hero` flips it to the gradient treatment.
// `value` is the raw number; `format` renders each animated frame, so the
// count-up plays against the real magnitude instead of a formatted string.
// min-w-0 + truncate on the value guarantees no horizontal clipping at 375px.
function StatCard({ icon, label, value, format = (n) => n, hero = false }) {
  const animated = useCountUp(value);
  return (
    <div
      className={`glass-panel flex-col justify-between card-hover relative overflow-hidden min-w-0 ${hero ? 'feature-card' : ''}`}
      style={{ padding: '0.8rem 0.85rem' }}
    >
      <div
        className={`flex items-center gap-2 ${hero ? 'text-on-accent' : 'text-secondary'}`}
        // Tighter than it was: the label and the figure are one unit, and the
        // gap between them was doing nothing but costing a row of pixels.
        style={{ opacity: hero ? 0.95 : 1, position: 'relative', zIndex: 1, marginBottom: '0.55rem' }}
      >
        <span className="flex-shrink-0 flex items-center">{icon}</span>
        <span className="uppercase">{label}</span>
      </div>
      <div
        className={`font-display font-black tabular-nums truncate min-w-0 ${hero ? 'text-on-accent' : 'text-primary'}`}
        style={{ fontSize: 'clamp(1.3rem, 6.4vw, 1.8rem)', lineHeight: 1.05, letterSpacing: 'var(--track-display)', position: 'relative', zIndex: 1 }}
      >
        {format(animated)}
      </div>
    </div>
  );
}

// Custom horizontal bar built from plain divs. Width animates via CSS
// transition; fill defaults to the danger gradient (debts) but can be
// overridden (e.g. --gradient-data for all-time totals, which are magnitude
// rather than paid/owed and so stay out of the status colour channel). `sub` renders a
// quiet caption under the bar.
// `display` overrides the formatted amount, for bars measuring something
// that isn't money (a count of splits, say).
function OwesBar({ name, amount, pct, fill, sub, display }) {
  return (
    <div className="flex-col gap-1 min-w-0">
      <div className="flex items-center justify-between gap-3 min-w-0">
        <span className="text-sm font-semibold text-primary truncate min-w-0">{name}</span>
        <span className="text-sm font-bold text-primary tabular-nums flex-shrink-0">
          {display ?? formatCompact(amount)}
        </span>
      </div>
      <div
        className="relative overflow-hidden"
        style={{
          height: '10px',
          borderRadius: 'var(--radius-full)',
          background: 'var(--glass-bg)',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            background: fill || 'var(--gradient-danger)',
            transformOrigin: 'left center',
            transform: `scaleX(${Math.max(0, Math.min(pct, 100)) / 100})`,
            transition: 'transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        />
      </div>
      {sub && <span className="text-xs text-secondary truncate">{sub}</span>}
    </div>
  );
}

export default function StatsPage() {
  const navigate = useNavigate();
  const {
    bills,
    people,
    meId,
    balances,
    personBillShares,
    lifetimePayments,
    totalOwedToYou,
  } = useAppContext();

  const [expandedPersonId, setExpandedPersonId] = useState(null);

  // Everyone who still owes you (balance > 0), excluding yourself. Sorted desc.
  const owers = useMemo(() => (
    people
      .filter((p) => p.id !== meId)
      .map((p) => ({ person: p, amount: balances[p.id] || 0 }))
      .filter((item) => item.amount > 0.005)
      .sort((a, b) => b.amount - a.amount)
  ), [people, meId, balances]);

  const totalSplurged = useMemo(
    () => bills.reduce((sum, b) => sum + (b.total || 0), 0),
    [bills]
  );

  const totalCollected = useMemo(
    () => people.reduce((sum, p) => sum + (lifetimePayments[p.id] || 0), 0),
    [people, lifetimePayments]
  );

  const avgPerOuting = bills.length > 0 ? totalSplurged / bills.length : 0;

  const biggestSplit = useMemo(
    () => bills.reduce((max, b) => ((b.total || 0) > (max?.total || 0) ? b : max), null),
    [bills]
  );

  const topOwers = owers.slice(0, 6);
  const maxOwed = topOwers.length > 0 ? topOwers[0].amount : 0;

  // All-time spending: everything each person has ever been billed across all
  // splits — settled or not — including yourself. "Who spent the most overall."
  const allTime = useMemo(() => (
    people
      .map((p) => ({
        person: p,
        total: (personBillShares[p.id] || []).reduce((sum, s) => sum + s.amount, 0),
        paid: lifetimePayments[p.id] || 0,
      }))
      .filter((r) => r.total > 0.005)
      .sort((a, b) => b.total - a.total)
  ), [people, personBillShares, lifetimePayments]);

  const maxAllTime = allTime.length > 0 ? allTime[0].total : 0;

  const months = useMemo(() => monthlySpend(bills, { months: 6 }), [bills]);
  const monthsPeak = months.reduce((m, b) => Math.max(m, b.total), 0);
  const collection = useMemo(
    () => collectionRate({ balances, lifetimePayments, people, meId }),
    [balances, lifetimePayments, people, meId],
  );
  const companions = useMemo(
    () => splitCompanions({ bills, people, meId, limit: 5 }),
    [bills, people, meId],
  );

  // Designed empty state — nothing to compute until the first split exists.
  if (bills.length === 0) {
    return (
      <>
        <main className="app-main">
          <h1 className="text-2xl mb-6 font-black">Stats</h1>
          <div className="empty-state">
            <div className="flex justify-center mb-3 text-secondary">
              <Receipt size={40} />
            </div>
            <h2 className="text-lg font-bold text-primary mb-1">Nothing to crunch yet</h2>
            <p className="text-sm text-secondary">Numbers show up after your first split.</p>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <main className="app-main">
        <div className="stats-page-header">
          <div>
            <h1 className="text-2xl font-black">Stats</h1>
            <p className="text-sm text-secondary">A quick read on your splitting habits.</p>
          </div>
          <div className="stats-header-actions">
            <button className="btn btn-secondary pressable" onClick={() => navigate('/stats/trends')}><BarChart3 size={16} /> Trends</button>
            <button className="btn btn-secondary pressable" onClick={() => navigate('/stats/people')}><Users size={16} /> People</button>
          </div>
        </div>

        {/* Headline stats — 2x2 grid; numbers use formatCompact so they never clip. */}
        <div
          className="mb-5"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '0.5rem',
          }}
        >
          <StatCard
            hero
            icon={<Wallet size={16} />}
            label="You're owed"
            value={totalOwedToYou}
            format={formatCompact}
          />
          <StatCard
            icon={<Receipt size={16} />}
            label="Outings"
            value={bills.length}
            format={Math.round}
          />
          <StatCard
            icon={<ArrowUpRight size={16} />}
            label="Splurged"
            value={totalSplurged}
            format={formatCompact}
          />
          <StatCard
            icon={<HandCoins size={16} />}
            label="Collected"
            value={totalCollected}
            format={formatCompact}
          />
        </div>

        {/* Light-touch insights — only when the data supports them. */}
        {bills.length > 0 && (
          <div className="flex gap-2 mb-5 min-w-0">
            <div className="glass-panel flex-1 min-w-0" style={{ padding: '0.7rem 0.85rem' }}>
              <p className="text-xs text-secondary uppercase tracking-wider font-semibold mb-1">
                Avg per outing
              </p>
              <p className="text-lg font-bold text-primary tabular-nums truncate">
                {formatCompact(avgPerOuting)}
              </p>
            </div>
            {biggestSplit && (
              <div className="glass-panel flex-1 min-w-0" style={{ padding: '0.7rem 0.85rem' }}>
                <p className="text-xs text-secondary uppercase tracking-wider font-semibold mb-1">
                  Biggest split
                </p>
                <p className="text-lg font-bold text-primary tabular-nums truncate">
                  {formatCompact(biggestSplit.total || 0)}
                </p>
                <p className="text-xs text-secondary truncate">{biggestSplit.title}</p>
              </div>
            )}
          </div>
        )}

        {/* Month by month — the question "am I spending more lately?" is the
            one a splitting app can actually answer, and nothing here answered
            it before. Empty months are drawn, not skipped. */}
        {monthsPeak > 0 && (
          <section className="mb-6">
            <h2 className="lab" style={{ marginBottom: '0.6rem' }}>Month by month</h2>
            <div className="glass-panel month-chart" style={{ padding: '1.25rem 1rem 1rem' }}>
              {months.map((m) => (
                <div key={m.key} className="month-col">
                  <span className="month-value">
                    {m.total > 0 ? formatCompact(m.total) : ''}
                  </span>
                  <div
                    className="month-bar"
                    style={{ height: `${Math.max(m.pct, m.total > 0 ? 4 : 0)}%` }}
                    role="img"
                    aria-label={`${m.label}: ${formatCurrency(m.total)} across ${m.count} ${m.count === 1 ? 'split' : 'splits'}`}
                  />
                  <span className="month-label">{m.label}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Collection rate — how much of what you fronted has come back. */}
        {collection.rate !== null && (
          <section className="mb-6">
            <h2 className="lab" style={{ marginBottom: '0.6rem' }}>Getting paid back</h2>
            <div className="glass-panel" style={{ padding: '1.25rem 1rem' }}>
              <div className="flex items-baseline justify-between mb-3">
                <span className="text-3xl font-bold tabular-nums">
                  {Math.round(collection.rate * 100)}%
                </span>
                <span className="text-sm text-secondary">
                  {formatCompact(collection.collected)} of {formatCompact(collection.billed)} back
                </span>
              </div>
              <div className="rate-track">
                <div
                  className="rate-fill"
                  style={{ width: `${Math.max(2, collection.rate * 100)}%` }}
                />
              </div>
              <p className="text-xs text-secondary" style={{ marginTop: '0.6rem' }}>
                {collection.outstanding > 0.005
                  ? `${formatCompact(collection.outstanding)} still out there.`
                  : 'Everyone has settled up.'}
              </p>
            </div>
          </section>
        )}

        {/* Who you actually go out with — counted in splits, not pesos. */}
        {companions.length > 0 && (
          <section className="mb-6">
            <h2 className="lab" style={{ marginBottom: '0.6rem' }}>Who you split with</h2>
            <div className="glass-panel flex-col gap-4" style={{ padding: '1.25rem 1rem' }}>
              {companions.map((c) => (
                <OwesBar
                  key={c.person.id}
                  name={c.person.name}
                  amount={c.count}
                  display={`${c.count} ${c.count === 1 ? 'split' : 'splits'}`}
                  pct={c.pct}
                  fill="var(--gradient-primary)"
                />
              ))}
            </div>
          </section>
        )}

        {/* Who owes you most — custom animated bars. */}
        {topOwers.length > 0 && (
          <section className="mb-6">
            <h2 className="lab" style={{ marginBottom: '0.6rem' }}>Who owes you most</h2>
            <div className="glass-panel flex-col gap-4" style={{ padding: '1.25rem 1rem' }}>
              {topOwers.map((item) => (
                <OwesBar
                  key={item.person.id}
                  name={item.person.name}
                  amount={item.amount}
                  pct={maxOwed > 0 ? (item.amount / maxOwed) * 100 : 0}
                />
              ))}
            </div>
          </section>
        )}

        {/* The running tab — tappable leaderboard with per-bill drill-down. */}
        <section className="mb-7">
          <h2 className="lab" style={{ marginBottom: '0.7rem' }}>The running tab</h2>

          {owers.length === 0 ? (
            <div className="empty-state">
              <p className="text-sm text-secondary">Everyone&apos;s squared up. Nice.</p>
            </div>
          ) : (
            <div className="flex-col gap-3">
              {owers.map((item, index) => {
                const isTop = index === 0;
                const isExpanded = expandedPersonId === item.person.id;
                const shares = personBillShares[item.person.id] || [];

                return (
                  <div key={item.person.id} className="flex-col gap-2 min-w-0">
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      aria-label={`${item.person.name} owes you ${formatCurrency(item.amount)}. Tap to ${isExpanded ? 'hide' : 'show'} breakdown.`}
                      onClick={() => setExpandedPersonId(isExpanded ? null : item.person.id)}
                      className="glass-panel pressable flex items-center justify-between gap-3 animate-slide-up min-w-0 cursor-pointer"
                      style={{
                        padding: '0.875rem 1rem',
                        width: '100%',
                        textAlign: 'left',
                        animationDelay: `${Math.min(index * 0.06, 0.4)}s`,
                        borderColor: isTop
                          ? 'var(--border-danger)'
                          : isExpanded
                            ? 'var(--accent-color)'
                            : undefined,
                        boxShadow: isTop ? 'var(--glow-danger)' : undefined,
                      }}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`avatar flex-shrink-0 ${isTop ? 'bg-danger' : index === 1 ? 'bg-warning' : 'bg-accent'}`}
                          style={{ width: '44px', height: '44px' }}
                        >
                          {isTop ? <Award size={22} /> : initialsOf(item.person.name)}
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-bold text-primary truncate">{item.person.name}</h3>
                          <p className="text-xs text-secondary flex items-center gap-1 truncate">
                            <ArrowUpRight
                              size={12}
                              className={`flex-shrink-0 ${isTop ? 'text-danger' : 'text-accent'}`}
                            />
                            Yet to pay you
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span
                          className={`font-bold text-lg tabular-nums ${isTop ? 'text-danger' : 'text-primary'}`}
                        >
                          {formatCompact(item.amount)}
                        </span>
                        <ChevronDown
                          size={18}
                          className="text-secondary"
                          style={{
                            transition: 'transform 0.2s ease',
                            transform: isExpanded ? 'rotate(180deg)' : 'none',
                          }}
                        />
                      </div>
                    </button>

                    {isExpanded && (
                      <div
                        className="glass-panel animate-slide-in flex-col"
                        style={{
                          padding: '0.875rem 1rem',
                          marginLeft: '0.75rem',
                          background: 'var(--glass-bg)',
                          borderLeft: '2px solid var(--accent-color)',
                        }}
                      >
                        <h4 className="text-xs font-bold text-secondary uppercase tracking-wider mb-2">
                          What they&apos;re in for
                        </h4>
                        {shares.length > 0 ? (
                          shares.map((share, idx) => (
                            <div
                              key={share.bill.id ?? idx}
                              className="flex justify-between items-center gap-3 py-2 min-w-0"
                              style={{
                                borderBottom:
                                  idx === shares.length - 1
                                    ? 'none'
                                    : '1px solid var(--glass-border)',
                              }}
                            >
                              <div className="flex-col min-w-0">
                                <span className="text-sm font-medium text-primary truncate">
                                  {share.bill.title}
                                </span>
                                <span className="text-xs text-secondary truncate">
                                  {formatDate(share.bill.date)}
                                </span>
                              </div>
                              <span className="text-sm font-bold text-accent tabular-nums flex-shrink-0">
                                {formatCurrency(share.amount)}
                              </span>
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-secondary">No recorded bills yet.</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* All-time spending — settled or not, yourself included. */}
        {allTime.length > 0 && (
          <section className="mb-7">
            <h2 className="lab" style={{ marginBottom: '0.4rem' }}>All-time spending</h2>
            <p className="text-sm text-secondary mb-3">
              Everything ever billed — paid or not — so you can see who splurges hardest.
            </p>
            <div className="glass-panel flex-col gap-4" style={{ padding: '1.25rem 1rem' }}>
              {allTime.map((r) => (
                <OwesBar
                  key={r.person.id}
                  name={r.person.id === meId ? `${r.person.name} (you)` : r.person.name}
                  amount={r.total}
                  pct={maxAllTime > 0 ? (r.total / maxAllTime) * 100 : 0}
                  fill="var(--gradient-data)"
                  sub={r.person.id !== meId && r.paid > 0.005
                    ? `${formatCompact(r.paid)} settled back`
                    : undefined}
                />
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  );
}
