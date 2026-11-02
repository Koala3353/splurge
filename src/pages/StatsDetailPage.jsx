import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, BarChart3, Users, Wallet } from 'lucide-react';
import { useAppContext } from '../store/AppContext';
import { monthlySpend } from '../utils/stats';
import { formatCompact, formatCurrency } from '../utils/format';

function ChartCard({ title, children, note }) {
  return (
    <section className="stats-section">
      <div className="stats-section-heading">
        <h2 className="lab">{title}</h2>
        {note && <span className="text-xs text-secondary">{note}</span>}
      </div>
      <div className="glass-panel chart-card">{children}</div>
    </section>
  );
}

export default function StatsDetailPage() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { bills, people, personBillShares, balances, meId } = useAppContext();
  const view = pathname.endsWith('/people') ? 'people' : 'trends';

  const months = useMemo(() => monthlySpend(bills, { months: 12 }), [bills]);
  const peak = Math.max(...months.map((m) => m.total), 1);
  const peopleTotals = useMemo(() => people
    .map((person) => {
      const derived = (personBillShares[person.id] || []).reduce((sum, share) => sum + share.amount, 0);
      const fallback = bills.reduce((sum, bill) => {
        if (!(bill.participants || []).includes(person.id)) return sum;
        return sum + ((bill.total || 0) / Math.max(1, bill.participants.length));
      }, 0);
      return {
        ...person,
        total: derived > 0.005 ? derived : fallback,
        owed: balances[person.id] || 0,
      };
    })
    .filter((person) => person.total > 0.005 || person.owed > 0.005)
    .sort((a, b) => b.total - a.total), [bills, people, personBillShares, balances]);

  return (
    <main className="app-main">
      <div className="stats-page-header">
        <button className="btn btn-secondary p-2 pressable" onClick={() => navigate('/stats')} aria-label="Back to stats">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-black">Stats</h1>
          <p className="text-sm text-secondary">Explore your splitting patterns.</p>
        </div>
      </div>

      <div className="stats-tabs" role="tablist" aria-label="Stats sections">
        <button className={view === 'trends' ? 'is-active' : ''} onClick={() => navigate('/stats/trends')} role="tab" aria-selected={view === 'trends'}>
          <BarChart3 size={16} /> Trends
        </button>
        <button className={view === 'people' ? 'is-active' : ''} onClick={() => navigate('/stats/people')} role="tab" aria-selected={view === 'people'}>
          <Users size={16} /> People
        </button>
      </div>

      {view === 'trends' ? (
        <>
          <ChartCard title="Monthly total" note="Last 12 months">
            {bills.length === 0 ? (
              <p className="text-sm text-secondary">Add your first split to see spending trends here.</p>
            ) : (
              <div className="chart-bars chart-bars-tall">
                {months.map((month) => (
                <div className="chart-bar-column" key={month.key} title={`${month.label}: ${formatCurrency(month.total)}`}>
                  <span className="chart-bar-value">{month.total > 0 ? formatCompact(month.total) : ''}</span>
                  <div className="chart-bar-track"><div className="chart-bar-fill" style={{ height: `${Math.max(month.total ? 5 : 0, (month.total / peak) * 100)}%` }} /></div>
                  <span className="chart-bar-label">{month.label}</span>
                </div>
                ))}
              </div>
            )}
          </ChartCard>
          <ChartCard title="Bill mix" note="Where totals come from">
            <div className="metric-list">
              <MetricRow icon={<Wallet size={16} />} label="Items" value={bills.reduce((sum, bill) => sum + bill.items.reduce((s, item) => s + (item.price || 0), 0), 0)} />
              <MetricRow icon={<BarChart3 size={16} />} label="Fees & tips" value={bills.reduce((sum, bill) => sum + (bill.fees || []).reduce((s, fee) => s + (fee.amount || 0), 0), 0)} />
              <MetricRow icon={<Users size={16} />} label="Average split" value={bills.length ? bills.reduce((sum, bill) => sum + (bill.total || 0), 0) / bills.length : 0} />
            </div>
          </ChartCard>
        </>
      ) : (
        <ChartCard title="People overview" note="Total share vs outstanding">
          <div className="stats-person-list">
            {peopleTotals.length === 0 && <p className="text-sm text-secondary">No people data yet.</p>}
            {peopleTotals.map((person) => {
              const max = peopleTotals[0]?.total || 1;
              return (
                <div className="stats-person-row" key={person.id}>
                  <div className="flex justify-between gap-3">
                    <span className="font-semibold truncate">{person.id === meId ? `${person.name} (you)` : person.name}</span>
                    <span className="font-bold tabular-nums">{formatCompact(person.total)}</span>
                  </div>
                  <div className="chart-bar-track"><div className="chart-bar-fill chart-bar-fill-secondary" style={{ width: `${(person.total / max) * 100}%` }} /></div>
                  <span className="text-xs text-secondary">{person.owed > 0.005 ? `${formatCompact(person.owed)} outstanding` : 'Settled'}</span>
                </div>
              );
            })}
          </div>
        </ChartCard>
      )}
    </main>
  );
}

function MetricRow({ icon, label, value }) {
  return (
    <div className="metric-row">
      <span className="flex items-center gap-2 text-secondary">{icon}{label}</span>
      <strong className="tabular-nums">{formatCompact(value)}</strong>
    </div>
  );
}
