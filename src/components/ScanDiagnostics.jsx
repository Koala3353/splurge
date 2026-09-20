import { useState } from 'react';
import { ChevronDown, ChevronUp, ScanLine } from 'lucide-react';

// Plain-language names for what the pipeline chose. The engine's own vocabulary
// ("PSM 6", "adaptive threshold") means nothing to someone holding a receipt,
// but WHICH treatment won is genuinely useful: it's the difference between
// "retake the photo" and "this receipt just prints faintly".
const VARIANT = {
  threshold: { label: 'High contrast', hint: 'Converted to pure black on white. Best on dark or unevenly lit shots.' },
  contrast:  { label: 'Contrast boost', hint: 'Grays stretched apart without flattening them. Best on faint thermal print.' },
  original:  { label: 'Original photo', hint: 'Used the photo untouched — it was already clean.' },
};

const confidenceTone = (c) => (c >= 75 ? 'var(--success)' : c >= 55 ? 'var(--accent-color)' : 'var(--danger)');

export default function ScanDiagnostics({ info }) {
  const [open, setOpen] = useState(false);
  if (!info) return null;

  const variant = VARIANT[info.variant] || { label: 'Unknown', hint: '' };
  const rotated = info.orientation !== 0;
  const facts = [
    rotated ? 'rotated upright' : 'upright',
    info.cropped ? 'cropped to receipt' : 'whole photo',
    info.psm === '4' ? 'column mode' : 'block mode',
  ];

  return (
    <div className="glass-panel" style={{ padding: '0.75rem', marginBottom: '0.75rem' }}>
      <div className="flex items-center gap-3 min-w-0">
        {info.preview
          ? <img
              src={info.preview}
              alt="What the scanner read"
              style={{
                width: 44, height: 58, objectFit: 'cover', flexShrink: 0,
                borderRadius: 'var(--radius-sm)', border: '1px solid var(--glass-border)',
              }}
            />
          : <div className="avatar bg-glass flex-shrink-0"><ScanLine size={18} /></div>}

        <div className="min-w-0" style={{ flex: 1 }}>
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-bold truncate">{variant.label}</span>
            {Number.isFinite(info.confidence) && (
              <span
                className="text-xs font-bold tabular-nums flex-shrink-0"
                style={{ color: confidenceTone(info.confidence) }}
              >
                {info.confidence}%
              </span>
            )}
          </div>
          {/* Wraps rather than truncates: the whole point of this line is
              telling you which treatment was used, so clipping it is worse
              than a second row. */}
          <p className="text-xs text-secondary" style={{ marginTop: 2, lineHeight: 1.35 }}>
            {facts.join(' · ')}
          </p>
          <p className="text-xs text-secondary" style={{ marginTop: 2 }}>
            Found {info.itemCount} {info.itemCount === 1 ? 'item' : 'items'}
            {info.feeCount > 0 && `, ${info.feeCount} ${info.feeCount === 1 ? 'fee' : 'fees'}`}
            {info.attempts > 1 && ` · ${info.attempts} passes`}
          </p>
        </div>

        <button
          type="button"
          className="btn p-2 pressable flex-shrink-0"
          aria-expanded={open}
          aria-label={open ? 'Hide scan details' : 'Show scan details'}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--glass-border)', paddingTop: '0.75rem' }}>
          <p className="text-xs text-secondary" style={{ marginBottom: '0.6rem' }}>{variant.hint}</p>

          {info.preview && (
            <>
              <p className="text-xs text-secondary font-bold uppercase tracking-wider" style={{ marginBottom: '0.4rem' }}>
                What the scanner saw
              </p>
              <img
                src={info.preview}
                alt="Processed receipt as passed to the recogniser"
                style={{
                  width: '100%', borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--glass-border)', marginBottom: '0.75rem',
                }}
              />
              <p className="text-xs text-secondary" style={{ marginBottom: '0.75rem' }}>
                If the text here looks cut off, skewed or washed out, that is what
                the recogniser had to work with — retaking the photo will help more
                than editing the items below.
              </p>
            </>
          )}

          <p className="text-xs text-secondary font-bold uppercase tracking-wider" style={{ marginBottom: '0.4rem' }}>
            Raw text read
          </p>
          <pre
            style={{
              margin: 0, maxHeight: 180, overflow: 'auto', whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere', fontSize: '0.72rem', lineHeight: 1.45,
              color: 'var(--text-secondary)', background: 'rgba(var(--tint-ink), 0.5)',
              border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-sm)',
              padding: '0.6rem',
            }}
          >
            {info.text?.trim() || '(nothing)'}
          </pre>
        </div>
      )}
    </div>
  );
}
