import { useRef } from 'react';
import { initialsOf } from '../../utils/format';

/**
 * Who is on one line of the bill.
 *
 * Assignment was the measured bottleneck: 12 of the ~30 taps in a six-item,
 * four-person dinner, because narrowing a line cost two taps per person and
 * there was no accelerator anywhere. Three things carry the cost down here:
 *
 *  1. **Drag to paint.** Press a cell and drag along the strip and every cell
 *     you cross takes the value of the first one — so taking three people off
 *     a line is one gesture, not three taps. `touch-action: pan-y` on the
 *     strip means a vertical drag still scrolls the page, so the gesture
 *     costs nothing to the people who never discover it.
 *  2. **The line above.** Two people sharing three dishes is the common real
 *     shape, and "Same as <item>" repeats a set in one tap.
 *  3. **Everyone**, as the first cell, so clearing a line and naming one
 *     person is two taps rather than four.
 *
 * A column accelerator (put one person on every line at once) lives one level
 * up, in StepItems, because it is about the bill and not about this line.
 *
 * Every cell carries the person's initials, which is why the strip can wrap
 * at a phone width instead of scrolling sideways under a header it has to
 * stay aligned with. Each is a real toggle button at the 44px floor, with
 * aria-pressed and a label naming both the person and the line.
 */
export default function WhoStrip({
  item,
  participants,
  nameOf,
  onToggle,
  onEveryone,
  copyFrom,
  onCopy,
}) {
  // The value being painted for the duration of one drag: true puts people
  // on, false takes them off. Null when no drag is in flight.
  const paint = useRef(null);
  // Who this drag has already set, so crossing a cell twice — or a render
  // that has not caught up yet — cannot flip it back.
  const touched = useRef(new Set());

  const everyone = participants.length > 0 && participants.every((id) => item.people.includes(id));

  const paintPerson = (personId) => {
    if (touched.current.has(personId)) return;
    touched.current.add(personId);
    if (item.people.includes(personId) !== paint.current) onToggle(item.id, personId);
  };

  const startPaint = (personId) => (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // Pointer capture would retarget every later move to this one cell, which
    // is the opposite of what a paint gesture needs.
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    paint.current = !item.people.includes(personId);
    touched.current = new Set();
    paintPerson(personId);
  };

  const dragPaint = (e) => {
    if (paint.current === null) return;
    const cell = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-person]');
    if (cell && cell.dataset.item === item.id) paintPerson(cell.dataset.person);
  };

  const endPaint = () => {
    paint.current = null;
  };

  // A pointer has already done the work on pointerdown. This runs for keyboard
  // activation, where there was no pointer sequence at all.
  const clickPerson = (personId) => (e) => {
    if (e.detail !== 0) return;
    onToggle(item.id, personId);
  };

  return (
    <div
      className="who"
      onPointerMove={dragPaint}
      onPointerUp={endPaint}
      onPointerCancel={endPaint}
      onPointerLeave={endPaint}
    >
      <button
        type="button"
        className="who__cell who__cell--all"
        aria-pressed={everyone}
        onClick={() => onEveryone(item.id)}
      >
        Everyone
      </button>

      {participants.map((personId) => {
        const on = item.people.includes(personId);
        return (
          <button
            key={personId}
            type="button"
            className="who__cell"
            data-item={item.id}
            data-person={personId}
            aria-pressed={on}
            aria-label={`${nameOf(personId)} on ${item.name.trim() || 'this line'}`}
            onPointerDown={startPaint(personId)}
            onClick={clickPerson(personId)}
          >
            <span aria-hidden="true">{initialsOf(nameOf(personId))}</span>
          </button>
        );
      })}

      {copyFrom ? (
        <button type="button" className="who__copy" onClick={onCopy}>
          Same as {copyFrom.name.trim() || 'the line above'}
        </button>
      ) : null}
    </div>
  );
}
