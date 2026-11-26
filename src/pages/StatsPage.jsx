import { useState, useMemo } from 'react';
import {
  monthlySpend, collectionRate, splitCompanions,
  settleDurations, settleSpeed, payOrder, chaseList, settleTrend,
} from '../utils/stats';
import { useAppContext } from '../store/AppContext';
import { useNavigate } from 'react-router-dom';
import { formatCurrency, formatDate, formatShortDate } from '../utils/format';
import { isSettled, withDerivedTotal } from '../utils/split';
import { sortBillsByDate } from '../utils/bills';
import Button from '../components/ui/Button';
import Row from '../components/ui/Row';
import Leader from '../components/ui/Leader';
import BarChart from '../components/stats/BarChart';
import SettleSpeed from '../components/stats/SettleSpeed';
import PayOrder from '../components/stats/PayOrder';
import ChaseList from '../components/stats/ChaseList';
import SettleTrend from '../components/stats/SettleTrend';
import '../components/shell.css';

/**
 * The statement.
 *
 * Not a dashboard: a printed statement. Ruled columns, mono figures, a
 * monthly ledger, and every chart built from plain CSS with no dependency —
 * which was already the genuine strength of this page and stays.
 *
 * The month bars are drawn at full height and scaled on the Y axis. They
 * shipped as eight simultaneous `transition: height` animations, which lays
 * out the page on every frame of every one of them; here they do not animate
 * at all, because a statement does not animate its own figures.
 */
export default function StatsPage() {
  const navigate = useNavigate();
  const {
    bills, people, meId, balances, personBillShares, lifetimePayments, totalOwedToYou,
    payments, needsSelfIdentity,
  } = useAppContext();

  const [expandedPersonId, setExpandedPersonId] = useState(null);

  const owers = useMemo(() => (
    people
      .filter((p) => p.id !== meId)
      .map((p) => ({ person: p, amount: balances[p.id] || 0 }))
      .filter((item) => item.amount > 0 && !isSettled(item.amount))
      .sort((a, b) => b.amount - a.amount)
  ), [people, meId, balances]);

  /* `withDerivedTotal`, not `b.total`: a quick split is stored without one,
     and reading the raw field put "Total split ₱0.00" above a ledger of real
     amounts. The month-by-month figures below already derive it, so the two
     halves of this page disagreed. */
  const totalSplurged = useMemo(
    () => bills.reduce((sum, b) => sum + withDerivedTotal(b).total, 0),
    [bills],
  );

  const totalCollected = useMemo(
    () => people.reduce((sum, p) => sum + (lifetimePayments[p.id] || 0), 0),
    [people, lifetimePayments],
  );

  const biggestSplit = useMemo(
    () => bills
      .map(withDerivedTotal)
      .reduce((max, b) => (b.total > (max?.total ?? -Infinity) ? b : max), null),
    [bills],
  );

  const allTime = useMemo(() => (
    people
      .map((p) => ({
        person: p,
        total: (personBillShares[p.id] || []).reduce((sum, s) => sum + s.amount, 0),
        paid: lifetimePayments[p.id] || 0,
      }))
      .filter((r) => r.total > 0 && !isSettled(r.total))
      .sort((a, b) => b.total - a.total)
  ), [people, personBillShares, lifetimePayments]);

  const months = useMemo(() => monthlySpend(bills, { months: 6 }), [bills]);
  const monthsPeak = months.reduce((m, b) => Math.max(m, b.total), 0);

  /* The chart's columns carry their own readout, so hovering, tapping or
     tabbing to one says what it is worth without scrolling to the ledger. */
  const monthColumns = useMemo(() => months.map((m) => ({
    key: m.key,
    label: m.label,
    pct: m.pct,
    hasData: m.total > 0,
    isPeak: m.total === monthsPeak && m.total > 0,
    readout: {
      name: m.label,
      figure: formatCurrency(m.total),
      note: m.count === 0 ? 'no splits' : `${m.count} ${m.count === 1 ? 'split' : 'splits'}`,
    },
  })), [months, monthsPeak]);

  const collection = useMemo(
    () => collectionRate({ balances, lifetimePayments, people, meId }),
    [balances, lifetimePayments, people, meId],
  );

  const companions = useMemo(
    () => splitCompanions({ bills, people, meId, limit: 5 }),
    [bills, people, meId],
  );

  /* Every payback figure below is derived from one walk of the FIFO
     allocation — payments carry no bill id, so the day a given person's share
     of a given split closed is something `settleDurations` has to find by
     replaying `settlement.js` with less money each time. Done once here; the
     four readings of it are cheap. */
  const durations = useMemo(
    () => (needsSelfIdentity ? [] : settleDurations({ bills, people, payments, meId })),
    [bills, people, payments, meId, needsSelfIdentity],
  );

  const speed = useMemo(() => settleSpeed({ records: durations }), [durations]);
  const order = useMemo(() => payOrder({ records: durations }), [durations]);
  const chase = useMemo(() => chaseList({ records: durations }), [durations]);
  const trend = useMemo(() => settleTrend({ records: durations, months: 6 }), [durations]);

  const period = useMemo(() => {
    const ordered = sortBillsByDate(bills);
    const newest = ordered[0];
    const oldest = ordered[ordered.length - 1];
    if (!newest || !oldest) return '';
    if (newest.id === oldest.id) return formatShortDate(newest.date);
    return `${formatShortDate(oldest.date)} – ${formatShortDate(newest.date)}`;
  }, [bills]);

  if (bills.length === 0) {
    return (
      <main className="app__main">
        <div className="column">
          <h1>Statement</h1>
          <section className="teach" aria-labelledby="stats-teach">
            <h2 className="section__label" id="stats-teach">
              Nothing to total yet
            </h2>
            <ol className="teach__steps">
              <li>Save a split and this page starts keeping the books.</li>
              <li>It totals what you fronted, month by month.</li>
              <li>And how much of it has actually come back to you.</li>
            </ol>
            <Button variant="solid" block onClick={() => navigate('/new-bill')}>
              Start a split
            </Button>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="app__main">
      <div className="column">
        <h1>Statement</h1>

        <p className="statement__meta section__more">
          <span>{period}</span>
          <span>as of {formatDate(new Date().toISOString())}</span>
        </p>

        {/* Summary — a ruled column of figures, not three tiles in a row. */}
        <section className="section" aria-labelledby="summary-label">
          <h2 className="section__label" id="summary-label">
            Summary
          </h2>
          <Row
            name="Splits recorded"
            figure={String(bills.length)}
          />
          <Row name="Total split" figure={formatCurrency(totalSplurged)} />
          <Row
            name="Average per split"
            figure={formatCurrency(totalSplurged / bills.length)}
          />
          <Row name="Collected" figure={formatCurrency(totalCollected)} />
          <Row
            name="Outstanding"
            figure={formatCurrency(totalOwedToYou)}
            state={isSettled(totalOwedToYou) ? 'settled' : 'owed'}
          />
          {biggestSplit && (
            <Row
              name="Biggest split"
              note={biggestSplit.title}
              figure={formatCurrency(biggestSplit.total || 0)}
            />
          )}
        </section>

        {/* Month by month: the one question a splitting app can answer about
            your own spending. The chart is the picture; the ledger under it is
            the record, and the record is what assistive tech reads. */}
        {monthsPeak > 0 && (
          <section className="section" aria-labelledby="months-label">
            <h2 className="section__label" id="months-label">
              Month by month
            </h2>

            <BarChart label="What you split each month" columns={monthColumns} />

            <ul className="section__more">
              {months.map((m) => (
                <li key={m.key}>
                  <Row
                    name={m.label}
                    note={m.count === 0 ? 'no splits' : `${m.count} ${m.count === 1 ? 'split' : 'splits'}`}
                    figure={formatCurrency(m.total)}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Getting paid back. */}
        {collection.rate !== null && (
          <section className="section" aria-labelledby="collection-label">
            <h2 className="section__label" id="collection-label">
              Getting paid back
            </h2>
            <p className="u-row">
              <span className="figure figure--total">
                {Math.round(collection.rate * 100)}%
              </span>
              <Leader />
              <span className="u-ink-2">
                {formatCurrency(collection.collected)} of{' '}
                {formatCurrency(collection.billed)}
              </span>
            </p>
            <div
              className="meter section__more"
              role="img"
              aria-label={`${Math.round(collection.rate * 100)} percent collected`}
            >
              <span
                className="meter__fill"
                style={{ scale: `${Math.max(0.02, collection.rate)} 1` }}
              />
            </div>
            <p className="balance__note section__more">
              {isSettled(collection.outstanding)
                ? 'Everyone has settled up.'
                : `${formatCurrency(collection.outstanding)} is still out there.`}
            </p>
          </section>
        )}

        {/* Who pays first, how long people take, who you have to chase.
            All four are withheld rather than guessed when the data is thin:
            a ranking built on one payment each is noise with names on it. */}
        {needsSelfIdentity ? (
          <section className="section" aria-labelledby="payback-label">
            <h2 className="section__label" id="payback-label">
              Getting paid back, per person
            </h2>
            <p className="u-ink-2">
              Tag yourself in settings and this page can say who settles first
              and how long each person takes. Until then every split counts its
              own payer as owing, so the figures would be wrong.
            </p>
          </section>
        ) : (
          <>
            <SettleSpeed speed={speed} />
            <PayOrder order={order} />
            <ChaseList chase={chase} />
            <SettleTrend trend={trend} />
          </>
        )}

        {/* The running tab. */}
        <section className="section" aria-labelledby="tab-label">
          <h2 className="section__label" id="tab-label">
            The running tab
          </h2>
          {owers.length === 0 ? (
            <p className="u-ink-2">Everyone has squared up. Nothing is outstanding.</p>
          ) : (
            <ul>
              {owers.map((item) => {
                const isExpanded = expandedPersonId === item.person.id;
                const shares = personBillShares[item.person.id] || [];
                return (
                  <li key={item.person.id}>
                    <Row
                      name={item.person.name}
                      note={isExpanded ? 'Tap to close' : 'Tap for the breakdown'}
                      figure={formatCurrency(item.amount)}
                      state="owed"
                      aria-expanded={isExpanded}
                      onClick={() =>
                        setExpandedPersonId(isExpanded ? null : item.person.id)
                      }
                    />
                    {isExpanded && (
                      <div className="drill">
                        <h3 className="section__label">What they are in for</h3>
                        {shares.length === 0 ? (
                          <p className="u-ink-3">No splits recorded against them.</p>
                        ) : (
                          shares.map((share, idx) => (
                            <Row
                              key={share.bill.id ?? idx}
                              name={share.bill.title}
                              note={formatShortDate(share.bill.date)}
                              figure={formatCurrency(share.amount)}
                            />
                          ))
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Who you actually go out with — counted in splits, not pesos. */}
        {companions.length > 0 && (
          <section className="section" aria-labelledby="companions-label">
            <h2 className="section__label" id="companions-label">
              Who you split with
            </h2>
            <ul>
              {companions.map((c) => (
                <li key={c.person.id}>
                  <Row
                    name={c.person.name}
                    figure={`${c.count} ${c.count === 1 ? 'split' : 'splits'}`}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* All-time: everything ever billed, settled or not, you included. */}
        {allTime.length > 0 && (
          <section className="section" aria-labelledby="alltime-label">
            <h2 className="section__label" id="alltime-label">
              All-time, per person
            </h2>
            <ul>
              {allTime.map((r) => (
                <li key={r.person.id}>
                  <Row
                    name={r.person.id === meId ? `${r.person.name} (you)` : r.person.name}
                    note={
                      r.person.id !== meId && r.paid > 0 && !isSettled(r.paid)
                        ? `${formatCurrency(r.paid)} settled back`
                        : undefined
                    }
                    figure={formatCurrency(r.total)}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
