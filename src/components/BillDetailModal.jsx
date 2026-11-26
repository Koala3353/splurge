import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../store/AppContext';
import { isSettled } from '../utils/split';
import { formatCurrency, formatDate } from '../utils/format';
import { buildBillBreakdown, buildPaymentStatus } from '../utils/shareText';
import Sheet from './ui/Sheet.jsx';
import Button from './ui/Button.jsx';
import Row from './ui/Row.jsx';
import Stamp from './ui/Stamp.jsx';
import ShareSheet from './ShareSheet';

/**
 * One saved split, read back: what was on the bill, what each person's share
 * came to, and who has settled it.
 *
 * Sharing is two labelled buttons in the body rather than a menu behind a
 * "Share" button — the old path put the message three modals deep for a
 * choice between two things.
 */
export default function BillDetailModal({ billId, onClose }) {
  const navigate = useNavigate();
  const { bills, billDuesById, billPersonStatus, people, removeBill, payInfo, meId } =
    useAppContext();
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Which message the share sheet is shaping: 'breakdown' | 'status' | null.
  const [shareKind, setShareKind] = useState(null);

  const bill = bills.find((b) => b.id === billId) || null;
  // Memoized so they stay referentially stable for buildShareBody below.
  const dues = useMemo(() => (billId && billDuesById[billId]) || {}, [billId, billDuesById]);
  const statusByPerson = useMemo(
    () => (billId && billPersonStatus[billId]) || {},
    [billId, billPersonStatus],
  );

  const nameOf = (id) => people.find((p) => p.id === id)?.name || '—';

  const close = () => {
    setConfirmDelete(false);
    onClose();
  };

  const handleEdit = () => {
    const id = bill?.id;
    close();
    if (id) navigate('/new-bill', { state: { editId: id } });
  };

  const handleRepeat = () => {
    const id = bill?.id;
    close();
    if (id) navigate(`/new-bill?from=${encodeURIComponent(id)}`);
  };

  const handleDelete = () => {
    if (bill) removeBill(bill.id);
    close();
  };

  // Rebuilt on every option change, so the sheet's preview stays live. Names
  // read differently outbound than in-app: the organizer becomes "me", and a
  // missing person shouldn't surface the UI's em-dash placeholder.
  const buildShareBody = useCallback((options) => {
    if (!bill) return '';
    const shareNameOf = (id) => (
      id === meId ? 'me' : (people.find((p) => p.id === id)?.name || 'Someone')
    );
    return shareKind === 'status'
      ? buildPaymentStatus({ bill, statusByPerson, nameOf: shareNameOf, meId, payInfo, options })
      : buildBillBreakdown({ bill, dues, nameOf: shareNameOf, payInfo, options });
  }, [bill, dues, statusByPerson, meId, payInfo, shareKind, people]);

  return (
    <>
      <Sheet
        open={!!bill && !shareKind}
        title={bill ? bill.title : 'Split'}
        onClose={close}
        footer={
          confirmDelete ? (
            <>
              <Button onClick={() => setConfirmDelete(false)}>Keep it</Button>
              <Button variant="danger" onClick={handleDelete}>
                Delete the split
              </Button>
            </>
          ) : (
            <>
              <Button onClick={handleEdit}>Edit</Button>
              <Button variant="danger" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            </>
          )
        }
      >
        {bill ? (
          <div className="u-stack-loose">
            <section>
              <p className="u-micro u-ink-2" style={{ margin: 0 }}>
                {formatDate(bill.date)}
              </p>
              <p className="figure figure--total" style={{ margin: 0 }}>
                {formatCurrency(bill.total || 0)}
              </p>
            </section>

            <section>
              <h3 className="section__label">Items</h3>
              {bill.items.length === 0 ? (
                <p className="u-ink-2" style={{ fontSize: 'var(--text-sm)' }}>
                  Nothing itemised — this one was split as a single amount.
                </p>
              ) : (
                <ul>
                  {bill.items.map((item) => (
                    <li key={item.id}>
                      <Row
                        name={item.name || 'Item'}
                        note={
                          item.people?.length
                            ? item.people.map(nameOf).join(', ')
                            : 'Nobody is on this one'
                        }
                        figure={formatCurrency(item.price)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {bill.fees?.length > 0 ? (
              <section>
                <h3 className="section__label">Fees and tips</h3>
                <ul>
                  {bill.fees.map((fee) => (
                    <li key={fee.id}>
                      <Row name={fee.name || 'Fee'} figure={formatCurrency(fee.amount)} />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section>
              <h3 className="section__label">The split</h3>
              <ul>
                {(bill.participants || []).map((pId) => {
                  const due = dues[pId] || 0;
                  const remaining = Math.max(0, statusByPerson[pId]?.remaining ?? due);
                  const counts = !isSettled(due);
                  const paid = counts && isSettled(remaining);
                  const theirs = pId !== meId;
                  return (
                    <li key={pId}>
                      <Row
                        name={nameOf(pId)}
                        // Paid/owes framing doesn't apply to your own row —
                        // you fronted the bill.
                        note={
                          theirs && counts && !paid
                            ? `Still owes ${formatCurrency(remaining)}`
                            : undefined
                        }
                        figure={formatCurrency(due)}
                        state={theirs && counts ? (paid ? 'settled' : 'owed') : 'default'}
                        trailing={theirs && paid ? <Stamp status="settled" /> : null}
                      />
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* The same prefill route the suggestion chips use — one path,
                not two. The wizard opens on a fresh draft hydrated from this
                bill's lines, prices and per-line assignments, and writes
                nothing until it is saved. */}
            <section>
              <h3 className="section__label">Do it again</h3>
              <Button block onClick={handleRepeat}>
                Split this again
              </Button>
              <p className="u-micro u-ink-3" style={{ marginBlockStart: 'var(--space-2)' }}>
                Opens a new split on these lines and these people. Last
                time&rsquo;s prices come with it, to correct where they moved.
              </p>
            </section>

            <section>
              <h3 className="section__label">Send it to them</h3>
              <div className="u-row" style={{ gap: 'var(--space-2)' }}>
                <Button block onClick={() => setShareKind('breakdown')}>
                  The breakdown
                </Button>
                <Button block onClick={() => setShareKind('status')}>
                  Who has paid
                </Button>
              </div>
            </section>

            {confirmDelete ? (
              <p className="u-ink-2" style={{ fontSize: 'var(--text-sm)' }}>
                Deleting this split removes it from everyone&apos;s balance. It
                cannot be undone.
              </p>
            ) : null}
          </div>
        ) : null}
      </Sheet>

      <ShareSheet
        open={!!shareKind && !!bill}
        title={shareKind === 'status' ? 'Who has paid' : 'The breakdown'}
        actionLabel="Share"
        buildText={buildShareBody}
        levels={shareKind === 'status' ? undefined : ['summary', 'items']}
        fields={shareKind === 'status'
          ? ['showDates', 'showPaid', 'showPayInfo']
          : ['showDates', 'showSharers', 'showPayInfo']}
        // A bill-level share is the one place the receipt image is the same
        // object as the message: one split, every line, what each person owes.
        // The sheet draws it on open and offers it as the second route.
        receipt={{ bill, dues, nameOf, meId }}
        onClose={() => setShareKind(null)}
      />
    </>
  );
}
