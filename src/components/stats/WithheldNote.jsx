/**
 * What is being withheld, and what it is waiting for.
 *
 * A ranking built on one data point each is noise wearing a leaderboard's
 * clothes. Rather than drop those people silently — which reads as "they have
 * never paid" — they are named here with the count still outstanding, because
 * "not enough splits yet" is a more useful thing to know than a wrong number.
 */
export default function WithheldNote({ rows, describe }) {
  if (!rows || rows.length === 0) return null;

  return (
    <p className="u-ink-3 u-micro section__more">
      {'Not ranked yet: '}
      {rows.map((row, i) => (
        <span key={row.person.id}>
          {i > 0 ? '; ' : ''}
          {row.person.name}
          {' — '}
          {describe(row)}
        </span>
      ))}
      .
    </p>
  );
}
