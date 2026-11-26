/**
 * "Which one is you?"
 *
 * `meId` defaults to null and the only ways to set it were an opt-in button
 * inside the wizard, a text link buried under a payment history, and Settings
 * — none of which a new user ever meets. Until it is set, every outbound
 * message invoices the user for their own dinner.
 *
 * So it is asked where the money is, with the answer one tap away in the
 * banner itself. A link into Settings would be a second screen between the
 * question and its answer, which is how it got lost in the first place.
 *
 * Dismissal is remembered, because being asked twice about a thing you have
 * decided not to do is nagging — Settings still holds the control.
 */
import { useState } from 'react';
import { useAppContext } from '../store/AppContext';

const KEY = 'splurge.self-banner';

const readDismissed = () => {
  try {
    return localStorage.getItem(KEY) === 'dismissed';
  } catch {
    return false;
  }
};

export default function SelfIdentityBanner() {
  const { people, needsSelfIdentity, setMeId } = useAppContext();
  const [dismissed, setDismissed] = useState(readDismissed);

  if (!needsSelfIdentity || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(KEY, 'dismissed');
    } catch {
      /* private mode — it will ask again next launch, which is the safer miss */
    }
  };

  return (
    <section className="notice" aria-labelledby="self-identity-title">
      <h2 className="notice__title" id="self-identity-title">
        Which one is you?
      </h2>
      <p className="notice__body">
        Tag yourself and your own share stops counting as money owed to you.
      </p>
      <div className="chips notice__chips">
        {people.map((p) => (
          <button
            key={p.id}
            type="button"
            className="chip"
            aria-pressed="false"
            onClick={() => setMeId(p.id)}
          >
            {p.name}
          </button>
        ))}
        <button type="button" className="chip" onClick={dismiss}>
          None of these
        </button>
      </div>
    </section>
  );
}
