import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useAppContext } from '../store/AppContext';
import { formatCurrency, formatRelativeDate } from '../utils/format';
import { sortBillsByDate } from '../utils/bills';
import Button from '../components/ui/Button';
import Row from '../components/ui/Row';
import SearchField from '../components/SearchField';
import BillDetailModal from '../components/BillDetailModal';
import '../components/shell.css';

export default function HistoryPage() {
  const navigate = useNavigate();
  const { bills } = useAppContext();
  const [search, setSearch] = useState('');
  const [detailBillId, setDetailBillId] = useState(null);

  // By date, through the same selector Home uses. Reversing assumed bills were
  // entered in the order they happened, so a backdated split put this list in
  // a different order than Home's for the same splits.
  const ordered = useMemo(() => sortBillsByDate(bills), [bills]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ordered;
    return ordered.filter((b) => (b.title || '').toLowerCase().includes(q));
  }, [ordered, search]);

  const shown = visible.reduce((sum, b) => sum + (b.total || 0), 0);

  return (
    <>
      <main className="app__main">
        <div className="column">
          <header className="masthead">
            <button type="button" className="icon-btn" onClick={() => navigate('/')}>
              <ChevronLeft size={20} strokeWidth={1.5} aria-hidden="true" />
              <span className="u-sr-only">Back to home</span>
            </button>
          </header>

          <h1>All splits</h1>

          {bills.length === 0 ? (
            <section className="teach" aria-labelledby="history-teach">
              <h2 className="section__label" id="history-teach">
                Nothing filed yet
              </h2>
              <ol className="teach__steps">
                <li>Split a bill — scan the receipt or type it in.</li>
                <li>Every split you save is filed here, newest first.</li>
                <li>Search it later by name when someone asks what they owe.</li>
              </ol>
              <Button variant="solid" block onClick={() => navigate('/new-bill')}>
                Start a split
              </Button>
            </section>
          ) : (
            <>
              {bills.length >= 5 && (
                <SearchField
                  label="Search splits"
                  value={search}
                  onChange={setSearch}
                  placeholder="Sisig night"
                  className="section__more"
                />
              )}

              <section className="section" aria-labelledby="history-list">
                <h2 className="section__label" id="history-list">
                  {visible.length} {visible.length === 1 ? 'split' : 'splits'} ·{' '}
                  {formatCurrency(shown)}
                </h2>

                {visible.length === 0 ? (
                  <p className="u-ink-2">
                    Nothing matches “{search.trim()}”. Splits are searched by the name you
                    gave them.
                  </p>
                ) : (
                  <ul>
                    {visible.map((bill) => (
                      <li key={bill.id}>
                        <Row
                          name={bill.title}
                          note={`${formatRelativeDate(bill.date)} · ${bill.items.length} ${bill.items.length === 1 ? 'item' : 'items'}`}
                          figure={formatCurrency(bill.total || 0)}
                          onClick={() => setDetailBillId(bill.id)}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </main>

      <BillDetailModal billId={detailBillId} onClose={() => setDetailBillId(null)} />
    </>
  );
}
