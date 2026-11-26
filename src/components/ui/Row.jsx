/**
 * Row — one receipt line: name, dotted leader, right-aligned mono figure.
 *
 *   <Row name="Sisig" figure="₱480.00" />
 *   <Row name="Ana" note="paid 2 of 3" figure="₱160.00" state="owed" />
 *   <Row name="Beni" figure="₱0.00" state="settled" onClick={open} />
 *
 * state: 'default' | 'owed' | 'settled'. Money is ink until it has a state;
 * `owed` is --stamp and `settled` is --ledger, and those are the only two
 * chromatic marks in the interface. Nothing but an amount may pass them.
 *
 * With onClick the row renders as a <button> so it is reachable, focusable
 * and announced as the control it already behaves like.
 */
import Leader from './Leader.jsx';

const STATES = { default: '', owed: 'figure--owed', settled: 'figure--settled' };

export default function Row({
  name,
  note,
  figure,
  state = 'default',
  trailing,
  onClick,
  className = '',
  ...rest
}) {
  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag
      className={['row', className].filter(Boolean).join(' ')}
      onClick={onClick}
      {...(onClick ? { type: 'button' } : {})}
      {...rest}
    >
      <span className="row__name">
        {name}
        {note ? <span className="row__note">{note}</span> : null}
      </span>
      <Leader />
      <span className={['row__figure', 'figure', STATES[state] ?? ''].filter(Boolean).join(' ')}>
        {figure}
      </span>
      {trailing ? <span className="row__trailing">{trailing}</span> : null}
    </Tag>
  );
}
