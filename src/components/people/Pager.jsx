import { ChevronLeft, ChevronRight } from 'lucide-react';

const arrow = {
  display: 'inline-flex',
  minWidth: 'var(--control-min)',
  minHeight: 'var(--control-min)',
  alignItems: 'center',
  justifyContent: 'center',
  border: 0,
  borderRadius: 'var(--radius-press)',
  background: 'transparent',
  color: 'var(--ink-2)',
};

/**
 * Page controls for a sliced list. Renders nothing while everything fits —
 * a pager under a list of three is furniture.
 */
export default function Pager({ label, total, state }) {
  if (state.pageCount < 2) return null;
  const { page, pageCount, start, end, setPage } = state;

  return (
    <div className="u-row" style={{ gap: 'var(--space-1)' }}>
      <button
        type="button"
        style={{ ...arrow, color: page === 0 ? 'var(--ink-3)' : 'var(--ink-2)' }}
        aria-label={`Previous page of ${label}`}
        disabled={page === 0}
        onClick={() => setPage(page - 1)}
      >
        <ChevronLeft size={24} strokeWidth={1.5} aria-hidden="true" />
      </button>
      <span className="u-micro u-ink-2">
        {start + 1}–{end} of {total}
      </span>
      <button
        type="button"
        style={{
          ...arrow,
          color: page >= pageCount - 1 ? 'var(--ink-3)' : 'var(--ink-2)',
        }}
        aria-label={`Next page of ${label}`}
        disabled={page >= pageCount - 1}
        onClick={() => setPage(page + 1)}
      >
        <ChevronRight size={24} strokeWidth={1.5} aria-hidden="true" />
      </button>
    </div>
  );
}
