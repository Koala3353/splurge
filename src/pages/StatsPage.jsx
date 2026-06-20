import { useState, useMemo } from 'react';
import { useAppContext } from '../store/AppContext';
import { formatCurrency, formatCompact, formatDate, initialsOf } from '../utils/format';
import Navigation from '../components/Navigation';
import {
  Wallet,
  ArrowUpRight,
  Award,
  Receipt,
  HandCoins,
  ChevronDown,
} from 'lucide-react';

// A single headline stat. `hero` flips it to the gradient treatment.
// min-w-0 + truncate on the value guarantees no horizontal clipping at 375px.
function StatCard({ icon, label, value, hero = false }) {
  return (
    <div
      className={`glass-panel flex-col justify-between card-hover relative overflow-hidden min-w-0`}
      style={{
        padding: '1.25rem 1rem',
        background: hero ? 'var(--gradient-primary)' : undefined,
        border: hero ? 'none' : undefined,
      }}
    >
      <div
        className={`flex items-center gap-2 mb-3 ${hero ? 'text-white' : 'text-secondary'}`}
        style={{ opacity: hero ? 0.9 : 1 }}
      >
        <span className="flex-shrink-0 flex items-center">{icon}</span>
        <span className="text-xs font-semibold uppercase tracking-wider truncate">{label}</span>
      </div>
      <div
        className={`font-black tabular-nums truncate min-w-0 ${hero ? 'text-white' : 'text-primary'}`}
        style={{ fontSize: 'clamp(1.35rem, 7vw, 2rem)', lineHeight: 1.1 }}
      >
        {value}
      </div>
    </div>
  );
}

// Custom horizontal bar built from plain divs. Width animates via CSS
// transition; fill uses the danger gradient.
function OwesBar({ name, amount, pct }) {
  return (
    <div className="flex-col gap-1 min-w-0">
      <div className="flex items-center justify-between gap-3 min-w-0">
        <span className="text-sm font-semibold text-primary truncate min-w-0">{name}</span>
        <span className="text-sm font-bold text-primary tabular-nums flex-shrink-0">
          {formatCompact(amount)}
        </span>
      </div>
      <div
        className="relative overflow-hidden"
        style={{
          height: '10px',
          borderRadius: 'var(--radius-full)',
          background: 'rgba(255,255,255,0.06)',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            borderRadius: 'var(--radius-full)',
            background: 'var(--gradient-danger)',
            transition: 'width 0.6s cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        />
      </div>
    </div>
  );
}

export default function StatsPage() {
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

  // Designed empty state — nothing to compute until the first split exists.
  if (bills.length === 0) {
    return (
      <div className="app-shell animate-slide-in">
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
        <Navigation />
      </div>
    );
  }

  return (
    <div className="app-shell animate-slide-in">
      <main className="app-main">
        <h1 className="text-2xl mb-5 font-black">Stats</h1>

        {/* Headline stats — 2x2 grid; numbers use formatCompact so they never clip. */}
        <div
          className="mb-8"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '0.75rem',
          }}
        >
          <StatCard
            hero
            icon={<Wallet size={16} />}
            label="You're owed"
            value={formatCompact(totalOwedToYou)}
          />
          <StatCard
            icon={<Receipt size={16} />}
            label="Outings"
            value={bills.length}
          />
          <StatCard
            icon={<ArrowUpRight size={16} />}
            label="Splurged"
            value={formatCompact(totalSplurged)}
          />
          <StatCard
            icon={<HandCoins size={16} />}
            label="Collected"
            value={formatCompact(totalCollected)}
          />
        </div>

        {/* Light-touch insights — only when the data supports them. */}
        {bills.length > 0 && (
          <div className="flex gap-3 mb-8 min-w-0">
            <div className="glass-panel flex-1 min-w-0" style={{ padding: '0.875rem 1rem' }}>
              <p className="text-xs text-secondary uppercase tracking-wider font-semibold mb-1 truncate">
                Avg per outing
              </p>
              <p className="text-lg font-bold text-primary tabular-nums truncate">
                {formatCompact(avgPerOuting)}
              </p>
            </div>
            {biggestSplit && (
              <div className="glass-panel flex-1 min-w-0" style={{ padding: '0.875rem 1rem' }}>
                <p className="text-xs text-secondary uppercase tracking-wider font-semibold mb-1 truncate">
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

        {/* Who owes you most — custom animated bars. */}
        {topOwers.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg mb-3 font-bold">Who owes you most</h2>
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
        <section className="mb-10">
          <h2 className="text-lg mb-4 font-bold">The running tab</h2>

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
                          ? 'rgba(244, 63, 94, 0.5)'
                          : isExpanded
                            ? 'var(--accent-color)'
                            : undefined,
                        boxShadow: isTop ? '0 0 20px rgba(244, 63, 94, 0.22)' : undefined,
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
                          background: 'rgba(255,255,255,0.02)',
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
      </main>
      <Navigation />
    </div>
  );
}
