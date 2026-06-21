import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../store/AppContext';
import { formatCurrency, formatRelativeDate } from '../utils/format';
import { Settings, Plus, ChevronRight, Receipt, Wallet } from 'lucide-react';
import Navigation from '../components/Navigation';
import BillDetailModal from '../components/BillDetailModal';
import SettingsModal from '../components/SettingsModal';

export default function HomePage() {
  const navigate = useNavigate();
  const { bills, people, balances, meId, totalOwedToYou, lifetimePayments } = useAppContext();
  const [detailBillId, setDetailBillId] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const owingCount = people.filter((p) => p.id !== meId && (balances[p.id] || 0) > 0.005).length;
  const collected = Object.entries(lifetimePayments)
    .reduce((sum, [id, v]) => (id === meId ? sum : sum + v), 0);
  const recent = [...bills].reverse().slice(0, 6);

  return (
    <div className="app-shell animate-slide-in">
      <main className="app-main">
        {/* Brand bar */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <div className="avatar gradient-primary" style={{ width: 34, height: 34 }}>
              <Wallet size={18} />
            </div>
            <h1 className="text-2xl font-black" style={{ letterSpacing: '-0.02em' }}>Splurge</h1>
          </div>
          <button
            className="btn bg-glass p-2 rounded-full pressable"
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
          >
            <Settings size={20} />
          </button>
        </div>

        {/* Balance hero */}
        <div className="balance-hero text-center mb-6" style={{ padding: '2.25rem 1rem' }}>
          <p className="text-secondary mb-2 uppercase tracking-wider text-xs font-bold">You&apos;re owed</p>
          <h2
            className="font-black break-words balance-amount"
            style={{ fontSize: 'clamp(2.25rem, 12vw, 3.25rem)', lineHeight: 1.1, color: totalOwedToYou > 0.005 ? 'var(--success)' : 'var(--text-primary)' }}
          >
            {formatCurrency(totalOwedToYou)}
          </h2>
          <p className="text-sm text-secondary mt-2">
            {owingCount > 0
              ? `across ${owingCount} ${owingCount === 1 ? 'person' : 'people'}`
              : 'All settled. Nice.'}
            {collected > 0.005 && ` · ${formatCurrency(collected)} collected`}
          </p>
        </div>

        {bills.length === 0 ? (
          /* Center the call-to-action in the space below the hero so the
             screen doesn't read as top-cramped with an empty bottom. */
          <div className="flex flex-col justify-center" style={{ minHeight: '42vh' }}>
            <div className="empty-state">
              <div className="avatar bg-glass mx-auto mb-3" style={{ width: 48, height: 48 }}>
                <Receipt size={24} className="text-secondary" />
              </div>
              <h4 className="font-bold text-primary mb-1">No splits yet</h4>
              <p className="text-sm mb-4">Scan a receipt or start one by hand. We&apos;ll do the math.</p>
              <button className="btn btn-primary pressable" onClick={() => navigate('/new-bill')}>
                <Plus size={18} /> Start a split
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-lg font-bold">Recent splits</h3>
              <button className="text-sm text-accent pressable" onClick={() => navigate('/new-bill')}>
                New split
              </button>
            </div>
            <div className="flex flex-col gap-3">
            {recent.map((bill) => (
              <button
                key={bill.id}
                className="glass-panel flex justify-between items-center gap-3 card-hover pressable"
                style={{ padding: '1rem', textAlign: 'left', width: '100%' }}
                onClick={() => setDetailBillId(bill.id)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="avatar bg-glass flex-shrink-0"><Receipt size={18} className="text-accent" /></div>
                  <div className="min-w-0">
                    <h4 className="font-bold truncate">{bill.title}</h4>
                    <p className="text-xs text-secondary mt-1 truncate whitespace-nowrap">
                      {formatRelativeDate(bill.date)} · {bill.items.length} {bill.items.length === 1 ? 'item' : 'items'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-lg font-bold tabular-nums">{formatCurrency(bill.total || 0)}</span>
                  <ChevronRight size={18} className="text-secondary" />
                </div>
              </button>
            ))}
            </div>
          </>
        )}
      </main>

      <BillDetailModal billId={detailBillId} onClose={() => setDetailBillId(null)} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <Navigation />
    </div>
  );
}
