/**
 * Stamp — status as a rubber stamp, not a pill.
 *
 *   <Stamp status="settled" land />    → SETTLED, in --ledger
 *   <Stamp status="partial" />         → PARTIAL, in --ink-3
 *
 * Owed is deliberately not stampable: an unpaid debt is the default state of
 * this app and needs no label, only the amount in --stamp.
 *
 * `land` plays the one authored delight moment in the product — the stamp
 * drops from 1.18 with a rotation overshoot as a balance closes. Pass it only
 * on the transition to settled, not on every render of a settled row, or the
 * moment stops meaning anything. Under prefers-reduced-motion the landing
 * collapses to an opacity fade (utilities.css); nothing here needs to branch.
 */
const LABELS = { settled: 'Settled', partial: 'Partial' };

export default function Stamp({ status = 'partial', land = false, className = '' }) {
  const label = LABELS[status] ?? LABELS.partial;

  return (
    <span
      className={[
        'stamp',
        status === 'settled' && 'stamp--settled',
        land && 'stamp--lands',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Uppercased in CSS so assistive tech is handed a word, not an acronym. */}
      {label}
    </span>
  );
}
