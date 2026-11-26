import { Trash2 } from 'lucide-react';
import Button from '../ui/Button.jsx';
import Row from '../ui/Row.jsx';
import Leader from '../ui/Leader.jsx';
import WhoStrip from './WhoStrip.jsx';
import TipControl from './TipControl.jsx';
import { formatCurrency, PESO } from '../../utils/format';

/**
 * Step 3 — the fees, the tip, and the printed sheet.
 *
 * The receipt below the editor is the one authored moment DESIGN.md allows on
 * this surface: it reveals top-to-bottom via clip-path, the way a thermal
 * printer feeds, once per bill and only here. Under prefers-reduced-motion it
 * collapses to a fade, handled in utilities.css — nothing branches here.
 */
export default function StepReview({
  printing,
  items,
  fees,
  tipPct,
  tipAmount,
  participants,
  nameOf,
  meId,
  dues,
  itemsTotal,
  total,
  onFeeField,
  onAddFee,
  onRemoveFee,
  onToggleFee,
  onEveryoneFee,
  onTipPct,
}) {
  return (
    <div className="u-stack-loose">
      <section>
        <h2 className="section__heading">Anything on top?</h2>
        <p className="u-ink-2" style={{ fontSize: 'var(--text-sm)' }}>
          Service charge, delivery, a senior or PWD discount — and who it
          belongs to, so a discount lands on the person who earned it.
        </p>

        <ul style={{ marginBlockStart: 'var(--space-4)' }}>
          {fees.map((fee, index) => {
            const discount = fee.amount < 0 || Object.is(fee.amount, -0);
            return (
              <li key={fee.id} className="line">
                <div className="line__edit">
                  <label className="u-sr-only" htmlFor={`${fee.id}-name`}>
                    Fee {index + 1} name
                  </label>
                  <input
                    id={`${fee.id}-name`}
                    className="field__control line__name"
                    value={fee.name}
                    placeholder="Service charge"
                    autoComplete="off"
                    onChange={(e) => onFeeField(fee.id, 'name', e.target.value)}
                  />
                  <div className="line__money">
                    <span className="line__peso" aria-hidden="true">
                      {discount ? `−${PESO}` : PESO}
                    </span>
                    <label className="u-sr-only" htmlFor={`${fee.id}-amount`}>
                      {`Fee ${index + 1} amount`}
                    </label>
                    <input
                      id={`${fee.id}-amount`}
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      className="field__control field__control--figure line__price"
                      value={fee.amount ? Math.abs(fee.amount) : ''}
                      placeholder="0"
                      onChange={(e) => {
                        const magnitude = parseFloat(e.target.value) || 0;
                        onFeeField(fee.id, 'amount', discount ? -magnitude : magnitude);
                      }}
                    />
                  </div>
                  <button type="button" className="icon-btn" onClick={() => onRemoveFee(fee.id)}>
                    <Trash2 size={24} strokeWidth={1.5} aria-hidden="true" />
                    <span className="u-sr-only">
                      {`Remove ${fee.name.trim() || `fee ${index + 1}`}`}
                    </span>
                  </button>
                </div>

                {/* A phone's decimal keypad has no minus key, so the sign is a
                    choice rather than something you can type. */}
                <div className="chips" style={{ marginBlockStart: 'var(--space-2)' }}>
                  <button
                    type="button"
                    className="chip"
                    aria-pressed={!discount}
                    onClick={() => onFeeField(fee.id, 'amount', Math.abs(fee.amount || 0))}
                  >
                    Charge
                  </button>
                  <button
                    type="button"
                    className="chip"
                    aria-pressed={discount}
                    onClick={() => onFeeField(fee.id, 'amount', -Math.abs(fee.amount || 0))}
                  >
                    Discount
                  </button>
                </div>

                <WhoStrip
                  item={{ ...fee, people: fee.people || [] }}
                  participants={participants}
                  nameOf={nameOf}
                  onToggle={onToggleFee}
                  onEveryone={onEveryoneFee}
                />
              </li>
            );
          })}
        </ul>

        <Button block style={{ marginBlockStart: 'var(--space-4)' }} onClick={onAddFee}>
          Add a fee or discount
        </Button>
      </section>

      <TipControl pct={tipPct} onPct={onTipPct} subtotal={itemsTotal} />

      {/* The sheet prints. */}
      <section
        className={`sheet-paper${printing ? ' is-printing' : ''}`}
        aria-labelledby="receipt-label"
      >
        <h2 className="section__label" id="receipt-label">
          The split
        </h2>

        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <Row
                name={item.name.trim() || 'Untitled line'}
                note={item.people.length === participants.length
                  ? 'Everyone'
                  : item.people.map((id) => nameOf(id)).join(', ')}
                figure={formatCurrency(item.price || 0)}
              />
            </li>
          ))}
        </ul>

        <hr className="fold" />

        <ul>
          <li>
            <Row name="Items" figure={formatCurrency(itemsTotal)} />
          </li>
          {fees.map((fee) => (
            <li key={fee.id}>
              <Row
                name={fee.name.trim() || 'Adjustment'}
                figure={formatCurrency(fee.amount || 0)}
              />
            </li>
          ))}
          {tipPct > 0 ? (
            <li>
              <Row name={`Tip (${tipPct}%)`} figure={formatCurrency(tipAmount)} />
            </li>
          ) : null}
        </ul>

        <div className="row" style={{ marginBlockStart: 'var(--space-4)' }}>
          <span className="row__name">
            <span className="u-micro u-ink-2">Total</span>
          </span>
          <Leader />
          <span className="figure figure--total">{formatCurrency(total)}</span>
        </div>

        <hr className="fold" />

        <h3 className="section__label">Each person owes</h3>
        <ul>
          {participants.map((id) => (
            <li key={id}>
              <Row
                name={`${nameOf(id)}${id === meId ? ' (you)' : ''}`}
                figure={formatCurrency(dues[id] || 0)}
              />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
