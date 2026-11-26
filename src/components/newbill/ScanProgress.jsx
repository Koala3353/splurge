import Button from '../ui/Button.jsx';

/**
 * What the scanner is doing, and the way out of it.
 *
 * The overlay this replaces had no exit and no measure: a wedged scan held
 * the user behind a full-screen spinner and took the in-progress bill with
 * it. Three changes: Cancel is a real button wired to `cancelScan()`, the bar
 * shows true progress through the candidate list rather than an indeterminate
 * spin, and this is a section of the page rather than a cover over it — the
 * lines already entered stay visible underneath.
 */
export default function ScanProgress({ shot, message, step, cancelling, onCancel }) {
  const pct = step ? Math.round((step.attempt / Math.max(1, step.total)) * 100) : 0;

  return (
    <section className="scanning" aria-labelledby="scanning-label">
      <h2 className="section__label" id="scanning-label">
        Reading the receipt
      </h2>

      {shot ? (
        <img className="scanning__shot" src={shot} alt="The photo being read" />
      ) : null}

      <p className="scanning__line" role="status">
        {cancelling ? 'Stopping, as soon as this pass lets go…' : message}
      </p>

      <div
        className="scanning__track"
        role="progressbar"
        aria-labelledby="scanning-label"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span className="scanning__fill" style={{ transform: `scaleX(${pct / 100})` }} />
      </div>

      {step ? (
        <p className="scanning__detail">
          Pass {step.attempt} of {step.total} — {step.trying}
          {step.reason ? `. Last pass: ${step.reason}.` : '.'}
        </p>
      ) : (
        <p className="scanning__detail">
          It stops itself after 45 seconds. Nothing you have typed is lost.
        </p>
      )}

      <Button block className="scanning__cancel" loading={cancelling} onClick={onCancel}>
        {cancelling ? 'Stopping' : 'Cancel the scan'}
      </Button>
    </section>
  );
}
