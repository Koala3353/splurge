import Row from '../ui/Row.jsx';
import Leader from '../ui/Leader.jsx';
import WithheldNote from './WithheldNote.jsx';
import { formatDays, needsMore } from './days.js';

/**
 * How long your money takes to come back.
 *
 * The median, not the mean: one friend who took nine months to pay back a
 * holiday would otherwise move everybody else's figure, and the number you
 * want is the ordinary night out, not the outlier.
 */
export default function SettleSpeed({ speed }) {
  return (
    <section className="section" aria-labelledby="speed-label">
      <h2 className="section__label" id="speed-label">
        How long you wait
      </h2>

      {speed.medianDays === null ? (
        <p className="u-ink-2">
          {speed.samples === 0
            ? 'No split has been settled yet, so there is no wait to measure.'
            : `A typical wait needs ${speed.minSamples} settled splits to stand up. There are ${speed.samples} so far.`}
        </p>
      ) : (
        <>
          <p className="u-row">
            <span className="figure figure--total">{formatDays(speed.medianDays)}</span>
            <Leader />
            <span className="u-ink-2">
              typical wait, across {speed.samples} settled splits
            </span>
          </p>

          {speed.ranked.length > 0 && (
            <ul className="section__more">
              {speed.ranked.map((r) => (
                <li key={r.person.id}>
                  <Row
                    name={r.person.name}
                    note={`${r.samples} settled`}
                    figure={formatDays(r.medianDays)}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <WithheldNote
        rows={speed.withheld}
        describe={(r) => needsMore(r.samples, speed.minSamples)}
      />
    </section>
  );
}
