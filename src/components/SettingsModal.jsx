import { useRef, useEffect, useState } from 'react';
import { X, UserCheck, Download, Upload, Trash2, Check } from 'lucide-react';
import { useAppContext } from '../store/AppContext';

export default function SettingsModal({ open, onClose }) {
  const dialogRef = useRef(null);
  const fileRef = useRef(null);
  const {
    people, meId, setMeId,
    exportData, importData, clearAll,
    bills, payments,
  } = useAppContext();
  const [confirmClear, setConfirmClear] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  const handleClose = () => {
    setConfirmClear(false);
    setToast('');
    onClose();
  };

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2200); };

  const handleExport = () => {
    try {
      const blob = new Blob([exportData()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `splurge-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      flash('Backup downloaded.');
    } catch {
      flash('Couldn’t export. Try again.');
    }
  };

  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        importData(reader.result);
        flash('Data restored.');
      } catch {
        flash('That file didn’t look like a Splurge backup.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={handleClose}
      style={{ width: '95vw', maxWidth: '460px', padding: 0, overflow: 'hidden' }}
    >
      <div className="flex flex-col" style={{ maxHeight: '85vh' }}>
        <div className="p-4 border-b border-glass flex justify-between items-center">
          <h2 className="text-xl font-bold">Settings</h2>
          <form method="dialog">
            <button className="btn bg-glass p-2 rounded-full" aria-label="Close"><X size={20} /></button>
          </form>
        </div>

        <div className="p-4 overflow-y-auto" style={{ flex: 1 }}>
          {/* Who is "you" */}
          <div className="flex items-center gap-2 mb-1">
            <UserCheck size={16} className="text-accent" />
            <h3 className="font-bold">This is me</h3>
          </div>
          <p className="text-sm text-secondary mb-3">
            Pick yourself so your own share never counts as money owed to you.
          </p>
          {people.length === 0 ? (
            <p className="text-sm text-secondary mb-2">Add people first, then come back to tag yourself.</p>
          ) : (
            <div className="flex gap-2 flex-wrap mb-2">
              {people.map((p) => {
                const isMe = p.id === meId;
                return (
                  <button
                    key={p.id}
                    className={`pill ${isMe ? 'pill-active' : 'pill-inactive'} flex items-center gap-1`}
                    onClick={() => setMeId(isMe ? null : p.id)}
                  >
                    {isMe && <Check size={14} />} {p.name}
                  </button>
                );
              })}
            </div>
          )}

          <hr style={{ border: 'none', borderTop: '1px solid var(--glass-border)', margin: '1.25rem 0' }} />

          {/* Backup */}
          <h3 className="font-bold mb-1">Your data</h3>
          <p className="text-sm text-secondary mb-3">
            Everything lives on this device. Back it up before clearing your browser or switching phones.
          </p>
          <div className="flex gap-2 mb-2">
            <button className="btn btn-secondary flex-1 pressable" onClick={handleExport}>
              <Download size={18} /> Back up
            </button>
            <button className="btn btn-secondary flex-1 pressable" onClick={() => fileRef.current?.click()}>
              <Upload size={18} /> Restore
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              onChange={handleImportFile}
              style={{ display: 'none' }}
            />
          </div>
          <p className="text-xs text-secondary">
            {bills.length} splits · {payments.length} payments saved
          </p>

          <hr style={{ border: 'none', borderTop: '1px solid var(--glass-border)', margin: '1.25rem 0' }} />

          {/* Danger zone */}
          {confirmClear ? (
            <div className="glass-panel p-3 flex flex-col gap-2" style={{ borderColor: 'rgba(244,63,94,0.4)' }}>
              <p className="text-sm text-center">Delete everything — people, splits, payments? This can’t be undone.</p>
              <div className="flex gap-2">
                <button className="btn btn-secondary flex-1" onClick={() => setConfirmClear(false)}>Keep my data</button>
                <button
                  className="btn btn-danger flex-1"
                  onClick={() => { clearAll(); setConfirmClear(false); flash('All data cleared.'); }}
                >
                  Delete all
                </button>
              </div>
            </div>
          ) : (
            <button className="btn btn-secondary w-full text-danger pressable" onClick={() => setConfirmClear(true)}>
              <Trash2 size={18} /> Clear all data
            </button>
          )}

          {toast && (
            <p className="text-sm text-center text-success mt-3" role="status">{toast}</p>
          )}
        </div>
      </div>
    </dialog>
  );
}
