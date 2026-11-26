import Row from '../ui/Row.jsx';
import BarChart from './BarChart.jsx';
import { formatDays } from './days.js';

/**
 * Is your money coming back faster than it used to?
 *
 * Bucketed by the month of the split, not of the payment, so a nine-month-old
 * debt is counted against the month it was incurred. The bars are the same
 * plain-CSS columns the ledger above uses, scaled on the Y axis rather than
 * animated — a statement does not animate its own figures.
 */
export default function SettleTrend({ trend }) {
  const withData = trend.months.filter((m) => m.samples > 0);
  if (withData.length === 0) return null;

  const slowest = Math.max(...withData.map((m) => m.medianDays));

  return (
    <section className="section" aria-labelledby="trend-label">
      <h2 className="section__label" id="trend-label">
        Settling faster or slower
      </h2>

      <BarChart
        label="How long each month's splits took to settle"
        columns={trend.months.map((m) => ({
          key: m.key,
          label: m.label,
          pct: m.pct,
          hasData: m.samples > 0,
          isPeak: m.medianDays === slowest && m.samples > 0,
          readout: {
            name: m.label,
            figure: m.medianDays === null ? '—' : formatDays(m.medianDays),
            note: m.samples === 0
              ? 'nothing settled'
              : `${m.samples} ${m.samples === 1 ? 'split' : 'splits'} settled`,
          },
        }))}
      />

      <ul className="section__more">
        {trend.months.map((m) => (
          <li key={m.key}>
            <Row
              name={m.label}
              note={m.samples === 0
                ? 'nothing settled'
                : `${m.samples} ${m.samples === 1 ? 'split' : 'splits'}`}
              figure={m.medianDays === null ? '—' : formatDays(m.medianDays)}
            />
          </li>
        ))}
      </ul>

      <p className="u-ink-2 section__more">
        {trend.change === null
          ? `A verdict on the direction needs ${trend.minSamples} settled splits in each half of this window.`
          : verdict(trend.change)}
      </p>
    </section>
  );
}

function verdict({ deltaDays, recentDays }) {
  const size = Math.abs(deltaDays);
  if (size < 1) return `Recent splits come back in about the same time, ${formatDays(recentDays)}.`;
  return deltaDays < 0
    ? `Recent splits come back ${formatDays(size)} sooner than the ones before them.`
    : `Recent splits take ${formatDays(size)} longer than the ones before them.`;
}
