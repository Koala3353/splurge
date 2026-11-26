/**
 * ToggleRow — one thing you can put in or leave out of a message.
 *
 *   <ToggleRow label="Date each split" hint="…" checked={on} onChange={set} />
 *
 * These used to be drawn as receipt lines: a dotted leader running to a
 * right-aligned figure that read "In" or "Out". That made a control look like
 * a printed fact, gave no sign it could be tapped, and labelled an on/off
 * state with two words that are not opposites in anyone's head. A leader
 * binds a name to an amount; there is no amount here, so there is no leader.
 *
 * It is a <button role="switch"> rather than a checkbox because the change
 * applies immediately — nothing is submitted — which is exactly what a switch
 * announces. The whole row is the target, so it clears 44px on every width,
 * and the focus ring is the global one.
 */
import { useId } from 'react';

export default function ToggleRow({ label, hint, checked, onChange, disabled = false }) {
  const hintId = useId();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={hint ? hintId : undefined}
      className="toggle"
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle__text">
        {label}
        {hint ? (
          <span className="toggle__hint" id={hintId}>
            {hint}
          </span>
        ) : null}
      </span>
      {/* The state is already in aria-checked, so the visible pair is marked
          decorative — otherwise a screen reader hears "on, switch, on". */}
      <span className="toggle__state" aria-hidden="true">
        {checked ? 'On' : 'Off'}
      </span>
      <span className="toggle__track" aria-hidden="true">
        <span className="toggle__knob" />
      </span>
    </button>
  );
}
