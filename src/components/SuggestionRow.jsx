import { useMemo, useState } from 'react';
import { Bookmark, Clock, RotateCcw } from 'lucide-react';
import { useAppContext } from '../store/AppContext';
import { buildSuggestions } from '../utils/suggestions';
import { formatCurrency } from '../utils/format';
import QuickSplitSheet from './QuickSplitSheet';

const ICON = {
  template: Bookmark,
  time: Clock,
  history: RotateCcw,
};

/**
 * The splits you are most likely making right now, as a row of chips above
 * the history. Renders nothing at all until there is something worth
 * suggesting — an empty "Suggestions" heading is worse than no heading.
 */
export default function SuggestionRow({ onLogged }) {
  const { bills, templates, people, meId } = useAppContext();
  const [active, setActive] = useState(null);

  // Recomputed when the data changes, not on a timer: a minute-by-minute
  // reshuffle of the row under the user's thumb would be worse than slightly
  // stale ranking.
  const suggestions = useMemo(
    () => buildSuggestions({ bills, templates, people, meId, now: Date.now(), limit: 6 }),
    [bills, templates, people, meId],
  );

  if (suggestions.length === 0) return null;

  return (
    <>
      <div className="section-head" style={{ marginTop: '0.25rem', marginBottom: '0.5rem' }}>
        <span className="lab">Split again</span>
      </div>

      <div className="suggestion-row" role="list">
        {suggestions.map((s) => {
          const Icon = ICON[s.kind] || RotateCcw;
          return (
            <button
              key={s.id}
              type="button"
              role="listitem"
              className="suggestion-chip pressable"
              onClick={() => setActive(s)}
            >
              <span className="suggestion-chip-top">
                <Icon size={13} className="flex-shrink-0" />
                <span className="suggestion-chip-title">{s.title}</span>
              </span>
              <span className="suggestion-chip-amount">{formatCurrency(s.amount)}</span>
              <span className="suggestion-chip-reason">{s.reason}</span>
            </button>
          );
        })}
      </div>

      <QuickSplitSheet
        suggestion={active}
        onClose={() => setActive(null)}
        onLogged={onLogged}
      />
    </>
  );
}
