import Field from '../ui/Field.jsx';
import { formatCurrency } from '../../utils/format';

const PRESETS = [0, 5, 10, 15];

/**
 * Tip, as a percentage of the subtotal.
 *
 * The README has claimed this since the first commit and no control for it
 * existed anywhere in the product. It is a percentage rather than an amount
 * because that is how a tip is decided, and the peso figure is shown beside
 * it so nobody is agreeing to a number they cannot see.
 *
 * "No tip" is a stated choice with its own control, not the absence of one:
 * in a country where service charge is usually already on the bill, leaving
 * nothing is a normal answer and should not read as an unfinished form.
 */
export default function TipControl({ pct, onPct, subtotal }) {
  const custom = !PRESETS.includes(pct);
  const amount = (subtotal * pct) / 100;

  return (
    <section>
      <h3 className="section__label">Tip</h3>
      <div className="chips">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            className="chip"
            aria-pressed={pct === p}
            onClick={() => onPct(p)}
          >
            {p === 0 ? 'No tip' : `${p}%`}
          </button>
        ))}
        <button
          type="button"
          className="chip"
          aria-pressed={custom}
          onClick={() => onPct(custom ? 0 : 12)}
        >
          Another amount
        </button>
      </div>

      {custom ? (
        <div style={{ marginBlockStart: 'var(--space-3)' }}>
          <Field
            label="Tip percentage"
            type="number"
            inputMode="decimal"
            step="0.5"
            min="0"
            max="100"
            figure
            value={pct}
            onChange={(v) => onPct(Math.min(100, Math.max(0, parseFloat(v) || 0)))}
            hint="Of the items, before any other fee."
          />
        </div>
      ) : null}

      <p className="u-ink-2" style={{ fontSize: 'var(--text-sm)', marginBlockStart: 'var(--space-2)' }}>
        {pct === 0
          ? 'Nothing added.'
          : `${pct}% of the items — ${formatCurrency(amount)}, shared the way the items were.`}
      </p>
    </section>
  );
}
