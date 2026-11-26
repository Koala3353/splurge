import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../store/AppContext';
import { buildSuggestions, repeatLabel } from '../utils/suggestions';
import { formatCurrency } from '../utils/format';
import QuickSplitSheet from './QuickSplitSheet';

const chip = {
  display: 'flex',
  flex: '0 0 auto',
  minHeight: 'var(--control-min)',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 'var(--space-1)',
  maxWidth: '14rem',
  padding: 'var(--space-2) var(--space-3)',
  border: 'var(--hairline) solid var(--ink-3)',
  borderRadius: 'var(--radius-press)',
  background: 'transparent',
  color: 'var(--ink)',
  scrollSnapAlign: 'start',
  textAlign: 'left',
};

const clamp = {
  display: 'block',
  maxWidth: '100%',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

/**
 * The splits you are most likely making right now, as a row of tickets above
 * the history. Renders nothing at all until there is something worth
 * suggesting — an empty "Split again" heading is worse than no heading.
 */
export default function SuggestionRow({ onLogged }) {
  const navigate = useNavigate();
  const { bills, templates, people, meId } = useAppContext();
  const [active, setActive] = useState(null);

  // Read once, when the row mounts, rather than on every render: the ranking
  // leans on the time of day, and a clock read during render is a value that
  // changes without the data changing. A minute-by-minute reshuffle of the row
  // under the user's thumb would be worse than slightly stale ranking anyway.
  const [now] = useState(() => Date.now());

  const suggestions = useMemo(
    () => buildSuggestions({ bills, templates, people, meId, now, limit: 6 }),
    [bills, templates, people, meId, now],
  );

  if (suggestions.length === 0) return null;

  return (
    <section>
      <h2 className="section__label">Split again</h2>

      <ul
        style={{
          display: 'flex',
          gap: 'var(--space-2)',
          overflowX: 'auto',
          scrollSnapType: 'x proximity',
          paddingBlockEnd: 'var(--space-2)',
        }}
      >
        {suggestions.map((s) => (
          <li key={s.id} style={{ display: 'flex' }}>
            {/* The chip says which of the two it is before it is tapped.
                An itemised repeat opens the wizard on last time's lines; a
                one-amount repeat is a figure to confirm and nothing more,
                and those are too different to leave to a surprise. */}
            <button
              type="button"
              style={chip}
              onClick={() => (
                s.itemised
                  ? navigate(`/new-bill?from=${encodeURIComponent(s.sourceBillId)}`)
                  : setActive(s)
              )}
            >
              <span style={{ ...clamp, fontSize: 'var(--text-sm)' }}>{s.title}</span>
              <span className="figure">{formatCurrency(s.amount)}</span>
              <span className="u-micro u-ink-2" style={clamp}>
                {repeatLabel(s)}
              </span>
              <span className="u-micro u-ink-3" style={clamp}>
                {s.reason}
              </span>
            </button>
          </li>
        ))}
      </ul>

      <QuickSplitSheet
        suggestion={active}
        onClose={() => setActive(null)}
        onLogged={onLogged}
      />
    </section>
  );
}
