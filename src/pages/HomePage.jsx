import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../store/AppContext';
import { useCountUp } from '../hooks/useCountUp';
import { formatCurrency, formatRelativeDate } from '../utils/format';
import { Settings, Plus, ChevronRight, Receipt, Wallet } from 'lucide-react';
import BillDetailModal from '../components/BillDetailModal';
import SettingsModal from '../components/SettingsModal';
import SuggestionRow from '../components/SuggestionRow';

export default function HomePage() {
  const navigate = useNavigate();
  const { bills, people, balances, meId, totalOwedToYou, lifetimePayments } = useAppContext();
  const [detailBillId, setDetailBillId] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState('');
  const animatedOwed = useCountUp(totalOwedToYou);

  const owingCount = people.filter((p) => p.id !== meId && (balances[p.id] || 0) > 0.005).length;
  const collected = Object.entries(lifetimePayments)
    .reduce((sum, [id, v]) => (id === meId ? sum : sum + v), 0);
  // Eight, not six: the dense row leaves room for them and the list is the
  // reason anyone opens this screen.
  //
  // Sorted by date rather than reversed. Reversing assumes bills were entered
  // in the order they happened, which is true right up until someone backdates
  // one — and then the "recent" list silently isn't.
  const recent = useMemo(
    () => [...bills].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8),
    [bills],
  );

  return (
    <>
      <main className="app-main">
        {/* Brand bar */}
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <div className="avatar gradient-primary" style={{ width: 26, height: 26, borderRadius: 'var(--radius-sm)' }}>
              <Wallet size={14} />
            </div>
            <h1 className="text-xl font-bold" style={{ letterSpacing: 'var(--track-title)' }}>Splurge</h1>
          </div>
          <button
            className="btn bg-glass p-2 rounded-full pressable"
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
            style={{ padding: '0.4rem' }}
          >
            <Settings size={17} />
          </button>
        </div>

        {/* The balance is a block of type, not a card. It was costing ~150px
            of height and a border to show one number; at this size it still
            dominates the screen and the list starts above the fold. */}
        <div className="mb-5">
          <p className="lab">You&apos;re owed</p>
          <h2
            className="font-bold break-words balance-amount"
            style={{
              fontSize: 'clamp(2.1rem, 11vw, 2.9rem)',
              lineHeight: 1,
              marginTop: '0.35rem',
              color: totalOwedToYou > 0.005 ? 'var(--text-primary)' : 'var(--success)',
            }}
          >
            {formatCurrency(animatedOwed)}
          </h2>

          {/* Three figures on one rule, where three cards used to be. */}
          <div className="stat-strip">
            <div>
              <span className="lab">{owingCount === 1 ? 'Person' : 'People'}</span>
              <b>{owingCount}</b>
            </div>
            <div>
              <span className="lab">Splits</span>
              <b>{bills.length}</b>
            </div>
            <div>
              <span className="lab">Back</span>
              <b style={{ color: collected > 0.005 ? 'var(--success)' : 'var(--text-tertiary)' }}>
                {formatCurrency(collected)}
              </b>
            </div>
          </div>
        </div>

        <SuggestionRow
          onLogged={(title) => {
            setToast(`${title} logged`);
            setTimeout(() => setToast(''), 2200);
          }}
        />

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
            <div className="flex justify-between items-center mb-2">
              <span className="lab">Recent</span>
              <div className="flex items-center gap-3">
                {bills.length > 8 && (
                  <button className="lab pressable" onClick={() => navigate('/history')}>
                    See all
                  </button>
                )}
                <button
                  className="lab pressable"
                  style={{ color: 'var(--accent-color)' }}
                  onClick={() => navigate('/new-bill')}
                >
                  + New
                </button>
              </div>
            </div>
            {/* Hairline-separated rows. The same eight splits that needed two
                screens as individual cards now land on one. */}
            <ul className="list-dense">
              {recent.map((bill) => (
                <li key={bill.id}>
                  <button
                    className="row-dense pressable"
                    onClick={() => setDetailBillId(bill.id)}
                  >
                    <span
                      className="avatar flex-shrink-0"
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--fill-accent-soft)',
                        border: '1px solid var(--border-warning)',
                      }}
                    >
                      <Receipt size={15} className="text-accent" />
                    </span>
                    <span className="min-w-0" style={{ flex: 1 }}>
                      <span className="block font-semibold truncate" style={{ fontSize: '1rem' }}>
                        {bill.title}
                      </span>
                      <span className="lab block" style={{ marginTop: '0.2rem' }}>
                        {formatRelativeDate(bill.date)} · {bill.items.length} {bill.items.length === 1 ? 'item' : 'items'}
                      </span>
                    </span>
                    <span className="font-semibold tabular-nums flex-shrink-0" style={{ fontSize: '1rem' }}>
                      {formatCurrency(bill.total || 0)}
                    </span>
                    <ChevronRight size={16} className="text-tertiary flex-shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>

      <BillDetailModal billId={detailBillId} onClose={() => setDetailBillId(null)} />
      {toast && <div className="toast" role="status">{toast}</div>}

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
