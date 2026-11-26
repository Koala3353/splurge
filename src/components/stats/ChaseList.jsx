import Row from '../ui/Row.jsx';
import Leader from '../ui/Leader.jsx';
import { formatCurrency } from '../../utils/format';
import { formatDays } from './days.js';

/**
 * Who you have to chase, oldest wait first.
 *
 * Ordered by age rather than amount — the running tab above already ranks by
 * amount, and a small debt from March is a different problem from a large one
 * from last week. Someone who has never paid anything has no settle time and
 * so appears in no median on this page; this is the list they belong on.
 */
export default function ChaseList({ chase }) {
  if (!chase.oldest) return null;
  const { oldest } = chase;

  return (
    <section className="section" aria-labelledby="chase-label">
      <h2 className="section__label" id="chase-label">
        Who you chase
      </h2>

      <p className="u-row">
        <span className="figure figure--total">{formatDays(oldest.oldestDays)}</span>
        <Leader />
        <span className="u-ink-2">the longest wait — {oldest.person.name}</span>
      </p>

      <ul className="section__more">
        {chase.people.map((c) => (
          <li key={c.person.id}>
            <Row
              name={c.person.name}
              note={`${formatDays(c.oldestDays)} on ${c.oldestBill.title}`}
              figure={formatCurrency(c.outstanding)}
              state="owed"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
