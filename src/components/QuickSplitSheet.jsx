import { useEffect, useState } from 'react';
import { useAppContext } from '../store/AppContext';
import { formatCurrency } from '../utils/format';
import { CADENCES } from '../utils/suggestions';
import Sheet from './ui/Sheet.jsx';
import Button from './ui/Button.jsx';
import Field from './ui/Field.jsx';
import Row from './ui/Row.jsx';

const AMOUNT_ID = 'quick-split-amount';

/**
 * The whole point of a suggestion is that repeating it costs one number.
 *
 * So this opens with the people already set, the amount prefilled with what
 * this split usually costs, and the field focused and selected — type to
 * replace it, or just confirm.
 */
export default function QuickSplitSheet({ suggestion, onClose, onLogged }) {
  return (
    <Sheet
      open={Boolean(suggestion)}
      title={suggestion ? suggestion.title : 'Quick split'}
      size="sm"
      onClose={onClose}
      footer={null}
    >
      {suggestion ? (
        // Keyed by the suggestion, so a different one arrives with its own
        // prefilled amount instead of an effect resetting the last one's.
        <QuickSplitForm
          key={suggestion.id}
          suggestion={suggestion}
          onClose={onClose}
          onLogged={onLogged}
        />
      ) : null}
    </Sheet>
  );
}

/**
 * What a tap on "Log the split" also sets up for next time.
 *
 * 'off' is the default and writes nothing. 'none' saves the split to the
 * suggestions row without ever prompting. The rest save it AND set a cadence,
 * which is what makes a split recurring — there is no separate kind of
 * object, because a template already carries every field a cadence needs.
 */
const REPEATS = [
  { id: 'off', label: 'Just this once' },
  { id: 'none', label: 'Keep it handy' },
  ...CADENCES.filter((c) => c.id !== 'none'),
];

function QuickSplitForm({ suggestion, onClose, onLogged }) {
  const { people, logQuickSplit, addTemplate, templates } = useAppContext();
  // A due prompt asks rather than assumes: rent and groceries move every
  // cycle, and a prefilled figure is one somebody confirms without reading.
  const [amount, setAmount] = useState(
    suggestion.askAmount || !suggestion.amount ? '' : String(suggestion.amount),
  );
  const [repeat, setRepeat] = useState('off');

  // Select rather than just focus: the prefilled amount is a suggestion, and
  // the most common edit is replacing it outright.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      document.getElementById(AMOUNT_ID)?.select?.();
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const named = (suggestion.people || [])
    .map((id) => people.find((p) => p.id === id))
    .filter(Boolean);
  const value = parseFloat(amount);
  const valid = value > 0;
  const each = valid && named.length ? value / named.length : 0;
  const alreadySaved = templates.some(
    (t) => t.title.toLowerCase() === suggestion.title.toLowerCase(),
  );

  const submit = (e) => {
    e.preventDefault();
    if (!valid) return;
    logQuickSplit({
      title: suggestion.title,
      people: suggestion.people,
      amount: value,
      templateId: suggestion.templateId,
    });
    if (repeat !== 'off') {
      addTemplate({
        title: suggestion.title,
        people: suggestion.people,
        amount: value,
        cadence: repeat,
      });
    }
    onLogged?.(suggestion.title);
    onClose();
  };

  return (
    <form onSubmit={submit} className="u-stack-loose">
      <p className="u-ink-2" style={{ margin: 0, fontSize: 'var(--text-sm)' }}>
        {suggestion.reason}
      </p>

      <Field
        id={AMOUNT_ID}
        label="Total"
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0"
        figure
        value={amount}
        onChange={setAmount}
        placeholder="0.00"
        hint={suggestion.askAmount && suggestion.amount > 0
          ? `Last time it was ${formatCurrency(suggestion.amount)}.`
          : undefined}
        autoFocus
      />

      <section>
        <h3 className="section__label">Split {named.length} ways</h3>
        <ul>
          {named.map((p) => (
            <li key={p.id}>
              <Row name={p.name} figure={valid ? formatCurrency(each) : '—'} />
            </li>
          ))}
        </ul>
      </section>

      {/* Offered only when it isn't already saved — a second identical
          template would just be noise in the row. A cadence here is the only
          way a split becomes recurring, and it is set at the moment the
          user has just proved the split repeats. */}
      {!suggestion.templateId && !alreadySaved ? (
        <section>
          <h3 className="section__label">Does this come round again?</h3>
          <div className="chips" role="radiogroup" aria-label="How often this split comes round">
            {REPEATS.map((r) => (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={repeat === r.id}
                className="chip"
                onClick={() => setRepeat(r.id)}
              >
                {r.label}
              </button>
            ))}
          </div>
          <p className="u-micro u-ink-3" style={{ marginBlockStart: 'var(--space-2)' }}>
            {repeat === 'off'
              ? 'Nothing is saved beyond the split itself.'
              : repeat === 'none'
                ? 'Kept in the suggestions row, with no reminder.'
                : 'Home asks you when it comes round. It never makes the split for you.'}
          </p>
        </section>
      ) : null}

      <Button type="submit" variant="solid" block disabled={!valid}>
        Log the split
      </Button>
    </form>
  );
}
