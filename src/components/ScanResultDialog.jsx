import { useRef, useEffect } from 'react';
import { X, RotateCcw, Check } from 'lucide-react';

const VARIANT_LABEL = {
  threshold: 'High contrast',
  contrast: 'Contrast boost',
  original: 'Original photo',
};
const SOURCE_LABEL = {
  flat: 'flattened from an angle',
  crop: 'cropped to the receipt',
  full: 'whole photo',
};

// Confidence is the engine's own mean certainty across recognised words. It is
// the single most useful number here: a low score with plausible-looking items
// is exactly the case worth double-checking before splitting money on it.
function verdict(c, items) {
  if (items === 0) return { tone: 'var(--danger)', head: "Couldn't read it", body: 'No line items came out of that photo. Retaking it usually beats fixing it by hand.' };
  if (c >= 80) return { tone: 'var(--success)', head: 'Clean read', body: 'The text came through clearly. Still worth a glance before you split it.' };
  if (c >= 60) return { tone: 'var(--accent-color)', head: 'Readable, check the numbers', body: 'Some characters were uncertain. Prices are the ones worth verifying.' };
  return { tone: 'var(--danger)', head: 'Rough read', body: 'The engine was unsure about much of this. Check every line, or retake the photo flatter and better lit.' };
}

export default function ScanResultDialog({ open, info, onClose, onRescan }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  const v = info ? verdict(info.confidence ?? 0, info.itemCount ?? 0) : null;

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
      style={{ width: '95vw', maxWidth: '440px', padding: 0, overflow: 'hidden' }}
    >
      {info && v && (
        <div className="flex flex-col" style={{ maxHeight: '86vh' }}>
          <div className="p-4 border-b border-glass flex justify-between items-center">
            <h2 className="text-xl font-bold">Scan result</h2>
            <form method="dialog">
              <button className="btn bg-glass p-2 rounded-full pressable" aria-label="Close"><X size={20} /></button>
            </form>
          </div>

          <div className="p-4 overflow-y-auto" style={{ flex: 1 }}>
            <div className="flex items-center gap-4 mb-4">
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <svg width="76" height="76" viewBox="0 0 76 76" aria-hidden="true">
                  <circle cx="38" cy="38" r="32" fill="none" stroke="var(--glass-border)" strokeWidth="7" />
                  <circle
                    cx="38" cy="38" r="32" fill="none" stroke={v.tone} strokeWidth="7" strokeLinecap="round"
                    strokeDasharray={`${(Math.max(0, Math.min(100, info.confidence ?? 0)) / 100) * 201} 201`}
                    transform="rotate(-90 38 38)"
                  />
                </svg>
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', flexDirection: 'column',
                }}>
                  <span className="font-display font-black tabular-nums" style={{ fontSize: '1.15rem', color: v.tone }}>
                    {Math.round(info.confidence ?? 0)}%
                  </span>
                </div>
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-bold" style={{ color: v.tone }}>{v.head}</h3>
                <p className="text-sm text-secondary" style={{ lineHeight: 1.45, marginTop: 2 }}>{v.body}</p>
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '0.75rem', marginBottom: '1rem' }}>
              <Row label="Found" value={`${info.itemCount} ${info.itemCount === 1 ? 'item' : 'items'}${info.feeCount ? `, ${info.feeCount} ${info.feeCount === 1 ? 'fee' : 'fees'}` : ''}`} />
              <Row label="Read as" value={VARIANT_LABEL[info.variant] || info.variant} />
              <Row label="Image used" value={SOURCE_LABEL[info.source] || (info.cropped ? 'cropped' : 'whole photo')} />
              {info.orientation !== 0 && <Row label="Orientation" value={`rotated ${info.orientation > 0 ? '90°' : '-90°'}`} />}
              <Row label="Attempts" value={`${info.attempts} of ${info.tried}`} last />
            </div>

            {info.preview && (
              <>
                <p className="text-xs text-secondary font-bold uppercase tracking-wider" style={{ marginBottom: '0.4rem' }}>
                  What the scanner read
                </p>
                <img
                  src={info.preview}
                  alt="Processed receipt as passed to the recogniser"
                  style={{ width: '100%', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)' }}
                />
                <p className="text-xs text-secondary" style={{ marginTop: '0.5rem', lineHeight: 1.45 }}>
                  If this looks cut off, skewed or washed out, the photo is the
                  problem rather than the reading — a flatter, better-lit retake
                  will do more than editing the lines by hand.
                </p>
              </>
            )}
          </div>

          <div className="p-4 border-t border-glass flex gap-2" style={{ flexShrink: 0 }}>
            <button className="btn btn-secondary flex-1 pressable" onClick={onRescan}>
              <RotateCcw size={18} /> Rescan
            </button>
            <button className="btn btn-primary flex-1 pressable" onClick={() => dialogRef.current?.close()}>
              <Check size={18} /> Looks good
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}

function Row({ label, value, last }) {
  return (
    <div
      className="flex justify-between items-center gap-3"
      style={{ padding: '0.4rem 0', borderBottom: last ? 'none' : '1px solid var(--glass-border)' }}
    >
      <span className="text-sm text-secondary flex-shrink-0">{label}</span>
      <span className="text-sm font-semibold text-primary" style={{ textAlign: 'right' }}>{value}</span>
    </div>
  );
}
