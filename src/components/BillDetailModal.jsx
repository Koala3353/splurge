import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Pencil, Trash2, Share2, Receipt, Users, ChevronLeft } from 'lucide-react';
import { useAppContext } from '../store/AppContext';
import { formatCurrency, formatDate, initialsOf } from '../utils/format';
import { buildBillBreakdown, buildPaymentStatus } from '../utils/shareText';
import ShareSheet from './ShareSheet';

export default function BillDetailModal({ billId, onClose }) {
  const dialogRef = useRef(null);
  const navigate = useNavigate();
  const { bills, billDuesById, billPersonStatus, people, removeBill, payInfo, meId } = useAppContext();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  // Which message the share sheet is shaping: 'breakdown' | 'status' | null.
  const [shareKind, setShareKind] = useState(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (billId && !d.open) d.showModal();
    else if (!billId && d.open) d.close();
  }, [billId]);

  const handleClose = () => {
    setConfirmDelete(false);
    setShareMenuOpen(false);
    setShareKind(null);
    onClose();
  };

  const bill = bills.find((b) => b.id === billId);
  // Memoized so they stay referentially stable for buildShareBody below.
  const dues = useMemo(() => (billId && billDuesById[billId]) || {}, [billId, billDuesById]);
  const statusByPerson = useMemo(
    () => (billId && billPersonStatus[billId]) || {},
    [billId, billPersonStatus],
  );
  const nameOf = (id) => people.find((p) => p.id === id)?.name || '—';

  const handleEdit = () => {
    dialogRef.current?.close();
    navigate('/new-bill', { state: { editId: bill.id } });
  };

  const handleDelete = () => {
    removeBill(bill.id);
    dialogRef.current?.close();
  };

  const openShare = (kind) => {
    setShareMenuOpen(false);
    setShareKind(kind);
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
    <dialog
      ref={dialogRef}
      onClose={handleClose}
      onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
      style={{ width: '95vw', maxWidth: '500px', padding: 0, overflow: 'hidden' }}
    >
      {bill && (
        <div className="flex flex-col" style={{ maxHeight: '85vh' }}>
          {/* Header */}
          <div
            className="p-4 border-b border-glass flex justify-between items-center bg-glass"
            style={{ position: 'sticky', top: 0, zIndex: 10, backdropFilter: 'blur(12px)' }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="avatar gradient-primary flex-shrink-0"><Receipt size={20} /></div>
              <div className="min-w-0">
                <h2 className="text-xl font-bold truncate">{bill.title}</h2>
                <p className="text-xs text-secondary">{formatDate(bill.date)}</p>
              </div>
            </div>
            <form method="dialog">
              <button className="btn bg-glass p-2 rounded-full pressable" aria-label="Close"><X size={20} /></button>
            </form>
          </div>

          <div className="p-4 overflow-y-auto" style={{ flex: 1 }}>
            {/* Total */}
            <div className="text-center mb-6">
              <p className="text-xs text-secondary uppercase tracking-wider mb-1">Total</p>
              <h1 className="text-4xl font-black break-words">{formatCurrency(bill.total || 0)}</h1>
            </div>

            {/* Items */}
            <div className="text-xs text-secondary font-bold uppercase tracking-wider mb-2">Items</div>
            <div className="flex flex-col gap-2 mb-5">
              {bill.items.length === 0 && <p className="text-secondary text-sm">No items.</p>}
              {bill.items.map((item) => (
                <div key={item.id} className="glass-panel p-3">
                  <div className="flex justify-between items-center gap-3">
                    <span className="font-semibold min-w-0 truncate">{item.name || 'Item'}</span>
                    <span className="font-bold tabular-nums flex-shrink-0">{formatCurrency(item.price)}</span>
                  </div>
                  {item.people?.length > 0 && (
                    <div className="flex gap-1 mt-2 flex-wrap">
                      {item.people.map((pId) => (
                        <span
                          key={pId}
                          className="text-xs px-2 py-1 rounded-full bg-glass text-secondary"
                        >
                          {nameOf(pId)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Fees */}
            {bill.fees?.length > 0 && (
              <>
                <div className="text-xs text-secondary font-bold uppercase tracking-wider mb-2">Fees &amp; tips</div>
                <div className="flex flex-col gap-2 mb-5">
                  {bill.fees.map((fee) => (
                    <div key={fee.id} className="flex justify-between items-center px-1">
                      <span className="text-sm text-secondary">{fee.name || 'Fee'}</span>
                      <span className="font-semibold tabular-nums">{formatCurrency(fee.amount)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Who owes what */}
            <div className="text-xs text-secondary font-bold uppercase tracking-wider mb-2">The split</div>
            <div className="flex flex-col gap-1 mb-2">
              {(bill.participants || []).map((pId) => {
                const due = dues[pId] || 0;
                const remaining = Math.max(0, statusByPerson[pId]?.remaining ?? due);
                const isPaid = due > 0.005 && remaining <= 0.005;
                return (
                  <div key={pId} className="flex justify-between items-center py-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="avatar bg-accent flex-shrink-0" style={{ width: 36, height: 36, fontSize: '0.85rem' }}>
                        {initialsOf(nameOf(pId))}
                      </div>
                      <div className="min-w-0">
                        <span className="font-semibold truncate block">{nameOf(pId)}</span>
                        {/* Paid/owes framing doesn't apply to your own row — you fronted the bill. */}
                        {pId !== meId && due > 0.005 && (
                          <span className={isPaid ? 'text-xs text-success' : 'text-xs text-secondary'}>
                            {isPaid ? 'Paid' : `Owes ${formatCurrency(remaining)}`}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="font-bold tabular-nums flex-shrink-0">{formatCurrency(due)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="p-4 border-t border-glass flex flex-col gap-2" style={{ flexShrink: 0 }}>
            {confirmDelete ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-center text-secondary">Delete this split? This can&apos;t be undone.</p>
                <div className="flex gap-2">
                  <button className="btn btn-secondary flex-1 pressable" onClick={() => setConfirmDelete(false)}>Keep</button>
                  <button className="btn btn-danger flex-1 pressable" onClick={handleDelete}>Delete</button>
                </div>
              </div>
            ) : shareMenuOpen ? (
              <div className="flex flex-col gap-2">
                <button className="btn btn-secondary pressable" onClick={() => openShare('breakdown')}>
                  <Receipt size={18} /> Share full breakdown
                </button>
                <button className="btn btn-secondary pressable" onClick={() => openShare('status')}>
                  <Users size={18} /> Share who&apos;s paid
                </button>
                <button className="btn text-secondary pressable" onClick={() => setShareMenuOpen(false)}>
                  <ChevronLeft size={18} /> Back
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button className="btn btn-secondary flex-1 pressable" onClick={() => setShareMenuOpen(true)} aria-label="Share split">
                  <Share2 size={18} /> Share
                </button>
                <button className="btn btn-secondary flex-1 pressable" onClick={handleEdit} aria-label="Edit split">
                  <Pencil size={18} /> Edit
                </button>
                <button
                  className="btn btn-secondary pressable text-danger"
                  onClick={() => setConfirmDelete(true)}
                  aria-label="Delete split"
                  style={{ flex: '0 0 auto' }}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <ShareSheet
        open={!!shareKind}
        title={shareKind === 'status' ? "Share who's paid" : 'Share breakdown'}
        actionLabel="Share"
        buildText={buildShareBody}
        levels={shareKind === 'status' ? undefined : ['summary', 'items']}
        fields={shareKind === 'status'
          ? ['showDates', 'showPaid', 'showPayInfo']
          : ['showDates', 'showSharers', 'showPayInfo']}
        onClose={() => setShareKind(null)}
      />
    </dialog>
  );
}
