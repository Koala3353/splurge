/**
 * Field — text and number input.
 *
 *   <Field label="Item" value={name} onChange={setName} placeholder="Sisig" />
 *   <Field label="Price" type="number" inputMode="decimal" figure
 *          value={price} onChange={setPrice} hint="Centavos are fine" />
 *
 * onChange receives the VALUE, not the event — every caller in this app
 * wanted the value and unwrapped it by hand.
 *
 * The focus indicator is non-negotiable and is the reason this component
 * exists: the stylesheet it replaces had `.input-ghost:focus { outline: none }`
 * at (0,2,0), which out-specified the global :focus-visible and left zero
 * focus ring on every text field in the product. Nothing here may remove an
 * indicator, and the focus rule in components.css sets one on :focus as well
 * as :focus-visible, so a pointer-focused field is still marked.
 */
import { useId } from 'react';

export default function Field({
  label,
  value,
  onChange,
  hint,
  figure = false,
  type = 'text',
  id,
  className = '',
  ...rest
}) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const hintId = hint ? `${fieldId}-hint` : undefined;

  return (
    <div className={['field', className].filter(Boolean).join(' ')}>
      <label className="field__label" htmlFor={fieldId}>
        {label}
      </label>
      <input
        id={fieldId}
        type={type}
        className={['field__control', figure && 'field__control--figure'].filter(Boolean).join(' ')}
        value={value}
        onChange={(e) => onChange?.(e.target.value, e)}
        aria-describedby={hintId}
        {...rest}
      />
      {hint ? (
        <span className="field__hint" id={hintId}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}
