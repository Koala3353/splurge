import Row from '../ui/Row.jsx';
import WithheldNote from './WithheldNote.jsx';
import { needsMore } from './days.js';

/**
 * Who settles first when more than one person owes on the same split.
 *
 * A different signal from speed, and worth its own section: someone can be
 * reliably first out of the gate and still be slow in absolute days, and the
 * person who is never first is the person you end up messaging.
 */
export default function PayOrder({ order }) {
  return (
    <section className="section" aria-labelledby="order-label">
      <h2 className="section__label" id="order-label">
        Who pays first
      </h2>

      {order.ranked.length === 0 ? (
        <p className="u-ink-2">
          {`This counts splits two or more people owed on. It takes ${order.minSamples} of them per person before anyone is ranked.`}
        </p>
      ) : (
        <ul>
          {order.ranked.map((r) => (
            <li key={r.person.id}>
              <Row
                name={r.person.name}
                note={`first on ${r.firsts} of ${r.contests}`}
                figure={`${Math.round(r.rate * 100)}%`}
              />
            </li>
          ))}
        </ul>
      )}

      <WithheldNote
        rows={order.withheld}
        describe={(r) => needsMore(r.contests, order.minSamples, 'shared split')}
      />
    </section>
  );
}
