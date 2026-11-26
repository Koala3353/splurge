import { useState } from 'react';
import Leader from '../ui/Leader.jsx';
import './stats.css';

/**
 * A column chart you can actually read a figure off.
 *
 * The bars were drawable but not readable: a 37px column at 375px cannot
 * carry a number, and the ledger underneath meant scrolling away from the
 * picture to find out what it showed. Each column is now a real <button>, and
 * the figures land in a readout line directly above the chart.
 *
 * The readout is inline rather than a floating tooltip, for three reasons:
 * a statement does not pop overlays over its own figures; an overlay inside a
 * flex row gets clipped the moment a column near the edge is the one you are
 * reading; and an inline line costs no positioning code and reads identically
 * to the rest of the page — label, dotted leader, mono figure.
 *
 * Three input paths, one state:
 *   pointer — a mouse pointer entering a column previews it. Gated on
 *     `pointerType === 'mouse'` and on `@media (hover: hover)` in the CSS, so
 *     a touch device never sticks in a hover state it cannot leave.
 *   touch   — a tap selects the column and keeps it selected (tap again to
 *     clear). This is the path the bug report is about, and it is the default
 *     behaviour of a <button>, not a synthesised one.
 *   keyboard — columns are tabbable and focus shows the same readout. It
 *     falls out of using a button, and each button also carries the whole
 *     readout as its accessible name, so nothing depends on seeing the line.
 */
export default function BarChart({ columns, label, defaultKey }) {
  const [selected, setSelected] = useState(null);
  const [previewed, setPreviewed] = useState(null);

  const fallback = defaultKey
    ?? [...columns].reverse().find((c) => c.hasData)?.key
    ?? columns[columns.length - 1]?.key;

  const activeKey = previewed ?? selected ?? fallback;
  const active = columns.find((c) => c.key === activeKey) ?? columns[0];

  const preview = (key) => (event) => {
    if (event.pointerType === 'mouse') setPreviewed(key);
  };

  return (
    <>
      {/* A mirror of the focused column's own accessible name, so assistive
          tech hears the figures once, from the control, not twice. */}
      <div className="chart__readout" aria-hidden="true">
        <p className="u-row">
          <span>{active.readout.name}</span>
          <Leader />
          <span className="figure">{active.readout.figure}</span>
        </p>
        <p className="chart__readout-note">{active.readout.note}</p>
      </div>

      <div className="chart" role="group" aria-label={label}>
        {columns.map((c) => (
          <button
            type="button"
            key={c.key}
            className="chart__col"
            aria-pressed={selected === c.key}
            aria-label={`${c.readout.name}, ${c.readout.figure}, ${c.readout.note}`}
            onPointerEnter={preview(c.key)}
            onPointerLeave={preview(null)}
            onFocus={() => setPreviewed(c.key)}
            onBlur={() => setPreviewed(null)}
            onClick={() => setSelected((s) => (s === c.key ? null : c.key))}
          >
            <span
              className={`chart__bar${c.isPeak ? ' chart__bar--peak' : ''}`}
              style={{ scale: `1 ${Math.max(c.pct, c.hasData ? 4 : 0) / 100}` }}
            />
          </button>
        ))}
      </div>

      <div className="chart__scale" aria-hidden="true">
        {columns.map((c) => (
          <span className="chart__tick" key={c.key}>
            {c.label}
          </span>
        ))}
      </div>
    </>
  );
}
