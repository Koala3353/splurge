import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { useAppContext } from '../store/AppContext';
import { formatCurrency, formatRelativeDate } from '../utils/format';
import { sortBillsByDate } from '../utils/bills';
import { isSettled } from '../utils/split';
import Button from '../components/ui/Button';
import Row from '../components/ui/Row';
import BillDetailModal from '../components/BillDetailModal';
import SettingsModal from '../components/SettingsModal';
import SuggestionRow from '../components/SuggestionRow';
import DuePrompt from '../components/recurring/DuePrompt';
import SelfIdentityBanner from '../components/SelfIdentityBanner';
import Toast from '../components/Toast';
import '../components/shell.css';

export default function HomePage() {
  const navigate = useNavigate();
  const {
    bills, people, balances, meId, totalOwedToYou, credits,
  } = useAppContext();
  const [detailBillId, setDetailBillId] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState('');

  const owing = useMemo(
    () => people.filter((p) => p.id !== meId && (balances[p.id] || 0) > 0 && !isSettled(balances[p.id])),
    [people, meId, balances],
  );

  // Money that has come in and has nothing yet to be applied to: someone paid
  // ahead, or the split they paid for was deleted. It is real money sitting in
  // the ledger, and no screen said so.
  const holding = useMemo(
    () => people
      .map((p) => ({ person: p, amount: credits[p.id] || 0 }))
      .filter((c) => c.amount > 0 && !isSettled(c.amount)),
    [people, credits],
  );

  // Through the shared selector in utils/bills.js — the one place this
  // ordering is defined, so History cannot drift away from it again.
  const recent = useMemo(() => sortBillsByDate(bills).slice(0, 8), [bills]);

  // Nothing outstanding is ink, not --stamp: the accent marks money you are
  // owed, and zero is not an amount anybody is chasing.
  const settled = isSettled(totalOwedToYou);

  return (
    <>
      <main className="app__main">
        <div className="column">
          <header className="masthead">
            <h1 className="masthead__mark">Splurge</h1>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings size={20} strokeWidth={1.5} aria-hidden="true" />
              <span className="u-sr-only">Settings</span>
            </button>
          </header>

          <SelfIdentityBanner />

          {/* The one display moment in the product. Mono, tabular, --stamp
              while there is money out there, ink once there isn't. */}
          <section className="balance section" aria-labelledby="balance-label">
            <h2 className="section__label" id="balance-label">
              You are owed
            </h2>
            <span
              className={`figure figure--display balance__figure${settled ? '' : ' figure--owed'}`}
            >
              {formatCurrency(totalOwedToYou)}
            </span>
            <p className="balance__note">
              {bills.length === 0
                ? 'Nothing split yet.'
                : owing.length === 0
                  ? `Everyone has settled up across ${bills.length} ${bills.length === 1 ? 'split' : 'splits'}.`
                  : `From ${owing.length} ${owing.length === 1 ? 'person' : 'people'} across ${bills.length} ${bills.length === 1 ? 'split' : 'splits'}.`}
            </p>

            {/* The primary action of the entire app. It shipped as a 40.7 ×
                13.8px text link in a row of metadata; it is now the one solid
                button on the screen, at the full width of the column. */}
            <Button
              variant="solid"
              block
              className="balance__cta"
              onClick={() => navigate('/new-bill')}
            >
              Start a split
            </Button>
          </section>

          {holding.length > 0 && (
            <section className="section" aria-labelledby="credits-label">
              <h2 className="section__label" id="credits-label">
                Received, not yet applied
              </h2>
              <ul>
                {holding.map(({ person, amount }) => (
                  <li key={person.id}>
                    <Row
                      name={person.name}
                      note="Covers their next split"
                      figure={formatCurrency(amount)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Above the suggestions, because a split that has come round is a
              thing to decide now, where the row below is a shortcut for
              whatever you happen to be doing. */}
          <DuePrompt
            onLogged={(title) => {
              setToast(`${title} logged`);
              setTimeout(() => setToast(''), 2200);
            }}
          />

          <SuggestionRow
            onLogged={(title) => {
              setToast(`${title} logged`);
              setTimeout(() => setToast(''), 2200);
            }}
          />

          {bills.length === 0 ? (
            <section className="teach" aria-labelledby="teach-label">
              <h2 className="section__label" id="teach-label">
                How a split works
              </h2>
              <ol className="teach__steps">
                <li>Scan the receipt, or type the items in by hand.</li>
                <li>Tap who is on each item. The math is ours.</li>
                <li>Send each person their share, then tick them off as they pay.</li>
              </ol>
              <p className="u-ink-3">
                Everything stays on this phone. Nothing is uploaded.
              </p>
            </section>
          ) : (
            <section className="section" aria-labelledby="recent-label">
              <h2 className="section__label" id="recent-label">
                Recent splits
              </h2>
              <ul>
                {recent.map((bill) => (
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
              {bills.length > recent.length && (
                <Button
                  variant="quiet"
                  block
                  className="section__more"
                  onClick={() => navigate('/history')}
                >
                  See all {bills.length} splits
                </Button>
              )}
            </section>
          )}
        </div>
      </main>

      <BillDetailModal billId={detailBillId} onClose={() => setDetailBillId(null)} />
      <Toast message={toast} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
