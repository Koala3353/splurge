import Button from '../ui/Button.jsx';

/**
 * Step 1 — says out loud that somebody is already on this split.
 *
 * The two-person case is the whole reason the setting exists: if every split
 * is with the same partner or flatmate, picking them out of a list each time
 * is pure friction. But a person quietly pre-selected and not noticed is the
 * worst outcome this feature has — a bill sent to somebody who was not there
 * — so the pre-selection is never silent. It is stated in words, above the
 * chips, and one tap takes them off.
 *
 * It renders only while the pre-selection is actually in force. Take them
 * off and it goes, because a banner describing a state that has ended is
 * noise; the chips below are then the plain truth of who is on the split.
 *
 * The from-scratch user pays nothing for it: with no usual crew set there is
 * no banner, no chips and no extra scroll.
 */
export default function UsualBanner({ label, count, onClear }) {
  return (
    <section className="notice">
      <h2 className="notice__title">
        Starting with {label}
      </h2>
      <p className="notice__body">
        {count === 1
          ? 'Your usual person is already on this split.'
          : `Your usual crew — ${count} people — is already on this split.`}{' '}
        Take them off if this one is not with them. It changes nothing for
        next time.
      </p>
      <div className="notice__chips">
        <Button onClick={onClear}>Not this time</Button>
      </div>
    </section>
  );
}
