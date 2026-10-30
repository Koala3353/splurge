import { useEffect, useRef, useState } from 'react';
import { X, Check, Bookmark, Users } from 'lucide-react';
import { useAppContext } from '../store/AppContext';
import { formatCurrency, initialsOf } from '../utils/format';

/**
 * The whole point of a suggestion is that repeating it costs one number.
 * So this sheet opens with the people already set, the amount prefilled with
 * what this split usually costs and the field focused and selected — type to
 * replace, or just confirm.
 */
export default function QuickSplitSheet({ suggestion, onClose, onLogged }) {
  const dialogRef = useRef(null);
  const amountRef = useRef(null);
  const { people, logQuickSplit, addTemplate, templates } = useAppContext();

  const [amount, setAmount] = useState('');
  const [saveTemplate, setSaveTemplate] = useState(false);

  const open = Boolean(suggestion);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) {
      setAmount(suggestion.amount ? String(suggestion.amount) : '');
      setSaveTemplate(false);
      d.showModal();
      // Select rather than just focus: the prefilled amount is a suggestion,
      // and the most common edit is replacing it outright.
      requestAnimationFrame(() => amountRef.current?.select());
    } else if (!open && d.open) {
      d.close();
    }
  }, [open, suggestion]);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return undefined;
    const onCancel = (e) => { e.preventDefault(); onClose(); };
    d.addEventListener('cancel', onCancel);
    d.addEventListener('close', onClose);
    return () => {
      d.removeEventListener('cancel', onCancel);
      d.removeEventListener('close', onClose);
    };
  }, [onClose]);

  if (!suggestion) return <dialog ref={dialogRef} className="sheet" aria-label="Quick split" />;

  const named = suggestion.people
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
    if (saveTemplate) {
      addTemplate({ title: suggestion.title, people: suggestion.people, amount: value });
    }
    onLogged?.(suggestion.title);
    onClose();
  };

  return (
    <dialog ref={dialogRef} className="sheet" aria-label={`Split ${suggestion.title}`}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-bold truncate">{suggestion.title}</h2>
            <p className="text-sm text-secondary">{suggestion.reason}</p>
          </div>
          <button
            type="button"
            className="bg-glass p-2 rounded-full flex-shrink-0 pressable"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <div className="quick-amount">
          <label htmlFor="quick-amount-input" className="text-xs uppercase text-tertiary">
            Total
          </label>
          <input
            id="quick-amount-input"
            ref={amountRef}
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="quick-amount-field"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Users size={14} className="text-tertiary flex-shrink-0" />
          <div className="flex items-center" style={{ marginLeft: '0.15rem' }}>
            {named.map((p, i) => (
              <span
                key={p.id}
                className="avatar bg-accent stacked-avatar"
                title={p.name}
                style={{ zIndex: named.length - i }}
              >
                {initialsOf(p.name)}
              </span>
            ))}
          </div>
          <span className="text-sm text-secondary">
            {valid
              ? `${formatCurrency(each)} each`
              : `Split ${named.length} ways`}
          </span>
        </div>

        {/* Offered only when it isn't already saved — a second identical
            template would just be noise in the row. */}
        {!suggestion.templateId && !alreadySaved && (
          <label className="flex items-center gap-2 text-sm text-secondary">
            <input
              type="checkbox"
              checked={saveTemplate}
              onChange={(e) => setSaveTemplate(e.target.checked)}
              style={{ width: 'auto' }}
            />
            <Bookmark size={14} />
            Keep this one handy
          </label>
        )}

        <button
          type="submit"
          className="btn btn-primary w-full pressable"
          style={{ borderRadius: 'var(--radius-full)', opacity: valid ? 1 : 0.45 }}
          disabled={!valid}
        >
          <Check size={18} />
          Log split
        </button>
      </form>
    </dialog>
  );
}
