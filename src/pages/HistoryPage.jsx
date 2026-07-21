import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../store/AppContext';
import { formatCurrency, formatRelativeDate } from '../utils/format';
import { ChevronLeft, ChevronRight, Receipt, Search, X } from 'lucide-react';
import BillDetailModal from '../components/BillDetailModal';

export default function HistoryPage() {
  const navigate = useNavigate();
  const { bills } = useAppContext();
  const [search, setSearch] = useState('');
  const [detailBillId, setDetailBillId] = useState(null);

  const ordered = useMemo(() => [...bills].reverse(), [bills]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ordered;
    return ordered.filter((b) => (b.title || '').toLowerCase().includes(q));
  }, [ordered, search]);

  return (
    <>
      <header className="app-header">
        <div className="flex justify-between items-center mb-4">
          <button
            className="btn p-2 pressable"
            style={{ borderRadius: '50%', background: 'var(--glass-bg)' }}
            onClick={() => navigate('/')}
            aria-label="Back"
          >
            <ChevronLeft size={20} />
          </button>
        </div>
        <h1 className="text-2xl font-bold mb-1">All splits</h1>
        <p className="text-sm text-secondary">
          {bills.length} {bills.length === 1 ? 'split' : 'splits'} total
        </p>
      </header>

      <main className="app-main">
        {bills.length === 0 ? (
          <div className="empty-state">
            <div className="avatar bg-glass mx-auto mb-3" style={{ width: 48, height: 48 }}>
              <Receipt size={24} className="text-secondary" />
            </div>
            <h4 className="font-bold text-primary mb-1">No splits yet</h4>
            <p className="text-sm mb-4">Everything you split will show up here.</p>
            <button className="btn btn-primary pressable" onClick={() => navigate('/new-bill')}>
              Start a split
            </button>
          </div>
        ) : (
          <>
            {bills.length >= 5 && (
              <div
                className="flex items-center gap-2 mb-4 glass-panel"
                style={{ padding: '0.5rem 0.85rem' }}
              >
                <Search size={16} className="text-secondary flex-shrink-0" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search splits"
                  aria-label="Search splits"
                  className="input-ghost flex-1 min-w-0"
                />
                {search && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    className="text-secondary flex-shrink-0 pressable"
                    onClick={() => setSearch('')}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            )}

            {visible.length === 0 ? (
              <div className="empty-state">
                <Search size={32} className="mx-auto mb-3 text-secondary" />
                <h3 className="font-bold text-lg text-primary">No matches</h3>
                <p className="text-sm mt-1">Try a different search.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3" style={{ paddingBottom: '1.5rem' }}>
                {visible.map((bill) => (
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
            )}
          </>
        )}
      </main>

      <BillDetailModal billId={detailBillId} onClose={() => setDetailBillId(null)} />
    </>
  );
}
