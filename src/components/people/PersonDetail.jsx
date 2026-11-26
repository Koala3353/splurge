import { useCallback, useMemo, useState } from 'react';
import { Undo2 } from 'lucide-react';
import { useAppContext } from '../../store/AppContext';
import { isSettled } from '../../utils/split';
import { formatCurrency, formatRelativeDate } from '../../utils/format';
import { isRecentNudge, nudgeNote } from '../../utils/nudges';
import { useSettleLanding } from '../../hooks/useSettleLanding';
import Sheet from '../ui/Sheet.jsx';
import Button from '../ui/Button.jsx';
import Field from '../ui/Field.jsx';
import Row from '../ui/Row.jsx';
import Stamp from '../ui/Stamp.jsx';
import ShareSheet from '../ShareSheet.jsx';
import { usePage } from '../../hooks/usePage';
import Pager from './Pager.jsx';

/**
 * One person's ledger: what they owe, what they have paid, and the two things
 * you open this for — logging a repayment and asking for one.
 *
 * It takes `personId` and `onClose` and nothing else. The thirteen props it
 * used to be handed were all already on the context it can read itself, which
 * meant a single field change cost four edits across two files.
 *
 * The share sheet is a sibling of this one, not a child: asking someone for
 * money used to cost four taps through three stacked modals, and a modal on
 * top of a modal is a stack the user has to unwind by hand.
 */
export default function PersonDetail({ personId, onClose }) {
  const {
    people,
    meId,
    setMeId,
    balances,
    credits,
    personBillShares,
    lifetimePayments,
    paymentsByPerson,
    addPayment,
    removePayment,
    renamePerson,
    buildShareText,
    nudges,
    recordNudge,
  } = useAppContext();

  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [customAmount, setCustomAmount] = useState('');
  const [shareOpen, setShareOpen] = useState(false);

  const person = people.find((p) => p.id === personId) || null;

  const buildRequestBody = useCallback(
    (options) => buildShareText(personId, options),
    [buildShareText, personId],
  );

  // Newest first — the split you just made is the one you came here to look at.
  const shares = useMemo(
    () => [...(personBillShares[personId] || [])].sort(
      (a, b) => new Date(b.bill.date) - new Date(a.bill.date),
    ),
    [personBillShares, personId],
  );
  const payments = useMemo(
    () => [...(paymentsByPerson[personId] || [])].sort(
      (a, b) => new Date(b.date) - new Date(a.date),
    ),
    [paymentsByPerson, personId],
  );
  const sharePage = usePage(shares.length);
  const paymentPage = usePage(payments.length);

  const balance = balances[personId] || 0;
  const owed = balance > 0 ? balance : 0;
  // An overpayment closes the row too — the extra sits as credit.
  const settled = isSettled(balance) || balance < 0;
  const landing = useSettleLanding(settled && !!person, personId);

  const lifetime = lifetimePayments[personId] || 0;
  const paidAhead = credits?.[personId] || 0;
  const isMe = personId === meId;

  // When you last actually chased them, and whether that was recent enough
  // that this would be a second ask rather than a first.
  //
  // The control is NOT dimmed and NOT put behind a confirmation. A greyed
  // button reads as disabled, which is a lie — there are good reasons to ask
  // twice — and a confirm dialog would put a modal in front of a flow this
  // app spent three commits flattening. What changes instead is the wording:
  // the button says "Ask again" and the line below says when, so the fact you
  // need is at the point of decision and the action stays one tap.
  const remindedAt = nudges?.[personId];
  const reminded = nudgeNote(remindedAt);
  const askedRecently = isRecentNudge(remindedAt);
  const canPayQuick = !settled && owed > 0;
  const customValid = parseFloat(customAmount) > 0;

  const saveName = (e) => {
    e.preventDefault();
    const next = draftName.trim();
    if (next) renamePerson(personId, next);
    setEditingName(false);
  };

  const logCustom = (e) => {
    e.preventDefault();
    const amt = parseFloat(customAmount);
    if (amt > 0) {
      addPayment(personId, amt);
      setCustomAmount('');
    }
  };

  return (
    <>
      <Sheet
        open={!!person && !shareOpen}
        title={person ? person.name : 'Person'}
        onClose={onClose}
        footer={
          <Button variant="solid" onClick={() => setShareOpen(true)}>
            {askedRecently ? 'Ask again' : 'Ask for it'}
          </Button>
        }
      >
        {person ? (
          <div className="u-stack-loose">
            <section>
              <h3 className="section__label">Where they stand</h3>
              <Row
                name="Owes you"
                // Plain language, on the line the decision is made from. Not
                // a `u-micro` label: that utility upper-cases, which turns a
                // sentence into a stamp and a stamp is reserved for status.
                note={reminded || undefined}
                figure={formatCurrency(owed)}
                state={settled ? 'settled' : 'owed'}
                trailing={settled ? <Stamp status="settled" land={landing} /> : null}
              />
              <Row name="Paid back, all time" figure={formatCurrency(lifetime)} />
              {paidAhead > 0 ? (
                <Row
                  name="Paid ahead"
                  note="Sitting as credit until their next split"
                  figure={formatCurrency(paidAhead)}
                />
              ) : null}
            </section>

            <section>
              <h3 className="section__label">Log a payment</h3>
              <div className="u-row" style={{ gap: 'var(--space-2)' }}>
                <Button
                  block
                  disabled={!canPayQuick}
                  onClick={() => addPayment(personId, owed / 2)}
                >
                  Half
                </Button>
                <Button
                  block
                  variant="solid"
                  disabled={!canPayQuick}
                  onClick={() => addPayment(personId, owed)}
                >
                  All of it
                </Button>
              </div>
              <form
                onSubmit={logCustom}
                className="u-row"
                style={{ gap: 'var(--space-2)', alignItems: 'flex-end', marginBlockStart: 'var(--space-3)' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Field
                    label="Some other amount"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    figure
                    value={customAmount}
                    onChange={setCustomAmount}
                    placeholder="480.50"
                  />
                </div>
                <Button type="submit" disabled={!customValid}>
                  Log
                </Button>
              </form>
            </section>

            <section>
              <div className="u-between">
                <h3 className="section__label" style={{ border: 0, marginBlockEnd: 0 }}>
                  Their splits
                </h3>
                <Pager label="splits" total={shares.length} state={sharePage} />
              </div>
              {shares.length === 0 ? (
                <p className="u-ink-2" style={{ fontSize: 'var(--text-sm)' }}>
                  Nothing split with {person.name} yet. Their share of the next
                  one lands here.
                </p>
              ) : (
                <ul>
                  {shares.slice(sharePage.start, sharePage.end).map((share, idx) => (
                    <li key={`${share.bill.id}-${idx}`}>
                      <Row
                        name={share.bill.title}
                        note={formatRelativeDate(share.bill.date)}
                        figure={formatCurrency(share.amount)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {payments.length > 0 ? (
              <section>
                <div className="u-between">
                  <h3 className="section__label" style={{ border: 0, marginBlockEnd: 0 }}>
                    Payments
                  </h3>
                  <Pager label="payments" total={payments.length} state={paymentPage} />
                </div>
                <ul>
                  {payments.slice(paymentPage.start, paymentPage.end).map((pm) => (
                    <li key={pm.id}>
                      <Row
                        name={formatRelativeDate(pm.date)}
                        note={pm.note || undefined}
                        figure={formatCurrency(pm.amount)}
                        trailing={
                          <button
                            type="button"
                            aria-label={`Undo the ${formatCurrency(pm.amount)} payment`}
                            onClick={() => removePayment(pm.id)}
                            style={{
                              display: 'inline-flex',
                              minWidth: 'var(--control-min)',
                              minHeight: 'var(--control-min)',
                              alignItems: 'center',
                              justifyContent: 'center',
                              border: 0,
                              background: 'transparent',
                              color: 'var(--ink-2)',
                            }}
                          >
                            <Undo2 size={24} strokeWidth={1.5} aria-hidden="true" />
                          </button>
                        }
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section>
              <h3 className="section__label">This person</h3>
              {editingName ? (
                <form
                  onSubmit={saveName}
                  className="u-row"
                  style={{ gap: 'var(--space-2)', alignItems: 'flex-end' }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Field label="Name" value={draftName} onChange={setDraftName} autoFocus />
                  </div>
                  <Button type="submit" variant="solid">
                    Save
                  </Button>
                </form>
              ) : (
                <div className="u-row" style={{ gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  <Button
                    onClick={() => {
                      setDraftName(person.name);
                      setEditingName(true);
                    }}
                  >
                    Rename
                  </Button>
                  {!isMe ? (
                    <Button onClick={() => setMeId(personId)}>This one is me</Button>
                  ) : (
                    <span className="u-micro u-ink-2">This one is you</span>
                  )}
                </div>
              )}
            </section>
          </div>
        ) : null}
      </Sheet>

      <ShareSheet
        open={shareOpen && !!person}
        title={person ? `Ask ${person.name}` : 'Ask'}
        actionLabel="Send request"
        buildText={buildRequestBody}
        levels={['summary', 'bills', 'items']}
        fields={['greeting', 'showDates', 'showSharers', 'showPaid', 'showHistory', 'showPayInfo']}
        // One person, one message: this message chases exactly them.
        // Deliberately no `receipt` — the image is a whole split drawn as a
        // printed bill, and this ask spans every split they are behind on.
        // Attaching one of them would answer a question nobody asked.
        nudgeIds={[personId]}
        onSent={recordNudge}
        onClose={() => setShareOpen(false)}
      />
    </>
  );
}
