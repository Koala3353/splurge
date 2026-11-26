/**
 * SearchField — one search box, shared.
 *
 *   <SearchField label="Search splits" value={q} onChange={setQ}
 *                placeholder="Sisig night" />
 *
 * HistoryPage and PeoplePage shipped this markup twice, verbatim, down to the
 * clear button — so a fix to one left the other behind. Like <Field>, onChange
 * receives the VALUE, not the event.
 *
 * The control is the Field control, so the focus indicator is the system's
 * one and not a second implementation of it. The label is visually hidden
 * (the magnifier and the placeholder carry the meaning on screen) but it is a
 * real <label>, not a placeholder standing in for one.
 */
import { useId } from 'react';
import { Search, X } from 'lucide-react';

export default function SearchField({
  label = 'Search',
  value,
  onChange,
  placeholder,
  clearLabel,
  id,
  className = '',
  ...rest
}) {
  const autoId = useId();
  const fieldId = id ?? autoId;

  return (
    <div className={['field', className].filter(Boolean).join(' ')}>
      <label className="u-sr-only" htmlFor={fieldId}>
        {label}
      </label>
      <div className="search">
        <Search className="search__icon" size={20} strokeWidth={1.5} aria-hidden="true" />
        <input
          id={fieldId}
          type="search"
          className="field__control search__input"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange?.(e.target.value, e)}
          {...rest}
        />
        {value ? (
          <button type="button" className="search__clear" onClick={() => onChange?.('')}>
            <X size={20} strokeWidth={1.5} aria-hidden="true" />
            <span className="u-sr-only">{clearLabel ?? `Clear ${label.toLowerCase()}`}</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
