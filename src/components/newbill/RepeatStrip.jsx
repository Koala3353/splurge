import { useMemo, useState } from 'react';
import { useAppContext } from '../../store/AppContext';
import { buildSuggestions, repeatLabel } from '../../utils/suggestions';

/**
 * Step 1 — "same as last time", in the family the step already offers.
 *
 * Step 1 offers three routes: pick a crew, pick people, or split one amount
 * evenly. Repeating belongs beside them, because the moment you notice you
 * are at the same place with the same four people is the moment you are
 * standing on this screen.
 *
 * It costs the from-scratch flow nothing. The strip only renders on a wizard
 * nobody has touched yet, so the moment a split is named or a person picked
 * it is gone, and no path to the fields passes through it.
 */
export default function RepeatStrip({ fresh, onRepeat }) {
  const { bills, templates, people, meId } = useAppContext();

  // Read the clock once, on mount: the ranking leans on the time of day, and
  // a clock read during render reshuffles the strip under the user's thumb.
  const [now] = useState(() => Date.now());

  const repeats = useMemo(
    () => buildSuggestions({ bills, templates, people, meId, now, limit: 8 })
      .filter((s) => s.sourceBillId)
      .slice(0, 3),
    [bills, templates, people, meId, now],
  );

  if (!fresh || repeats.length === 0) return null;

  return (
    <section>
      <h2 className="section__label">Same as last time</h2>
      <div className="chips">
        {repeats.map((s) => (
          <button
            key={s.id}
            type="button"
            className="chip"
            onClick={() => onRepeat(s.sourceBillId)}
          >
            {s.title}
            <span className="u-micro u-ink-3">{repeatLabel(s)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
