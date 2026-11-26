import { useMemo, useState } from 'react';
import { useAppContext } from '../../store/AppContext';
import { dueTemplates } from '../../utils/suggestions';
import { formatCurrency } from '../../utils/format';
import Button from '../ui/Button.jsx';
import QuickSplitSheet from '../QuickSplitSheet';

/**
 * The saved splits that have come round again — rent on the first, groceries
 * every Saturday — offered on Home at the moment they are due.
 *
 * **It offers; it never creates.** The decision is written down here because
 * it is the one that matters: an auto-created bill is a debt the user never
 * confirmed, against a friend who never agreed to it, at an amount the app
 * guessed. They would find it only when the balance was already wrong, and
 * the app would have no way to tell an invented bill from a real one. So
 * the prompt asks, and the amount is typed rather than assumed — rent moves,
 * groceries move, and last month's figure is a starting point at best. It is
 * shown underneath the field rather than filled into it.
 *
 * "Not now" snoozes for a day instead of deleting the reminder: a prompt you
 * cannot dismiss is a prompt you learn to ignore, and one that dismissal
 * destroys is a feature nobody will risk tapping.
 */
export default function DuePrompt({ onLogged }) {
  const { templates, people, meId, snoozeTemplate } = useAppContext();
  const [active, setActive] = useState(null);

  // One clock read per mount. Due-ness changes by the day, not by the render,
  // and a figure that reads the clock while rendering is a value that moves
  // without the data moving.
  const [now] = useState(() => Date.now());

  // Three at most. Everything due is still due tomorrow, and a home screen
  // that opens on a wall of prompts is one the user learns to scroll past —
  // the most overdue are at the top, which are the ones worth asking about.
  const due = useMemo(
    () => dueTemplates({ templates, people, now }).slice(0, 3),
    [templates, people, now],
  );

  if (due.length === 0) return null;

  const nameOf = (id) => (
    id === meId ? 'you' : people.find((p) => p.id === id)?.name || 'someone'
  );

  // "with Ana", "with Ana and Jericho", "with Ana, Jericho and 2 others".
  const crewWord = (ids) => {
    const names = ids.filter((id) => id !== meId).map(nameOf);
    if (names.length === 0) return 'on your own';
    if (names.length === 1) return `with ${names[0]}`;
    if (names.length === 2) return `with ${names[0]} and ${names[1]}`;
    return `with ${names[0]}, ${names[1]} and ${names.length - 2} ${names.length - 2 === 1 ? 'other' : 'others'}`;
  };

  return (
    <section aria-labelledby="due-label">
      <h2 className="section__label" id="due-label">
        Due again
      </h2>

      {due.map((d) => (
        <article className="notice" key={d.id}>
          <h3 className="notice__title">
            {d.title} {crewWord(d.people)} — split it again?
          </h3>
          <p className="notice__body">
            {d.reason}.{' '}
            {d.amount > 0
              ? `It came to ${formatCurrency(d.amount)} last time; you type this one.`
              : 'You type the amount — nothing is saved until you do.'}
          </p>
          <div className="notice__chips u-row">
            <Button
              onClick={() => setActive({
                id: `d:${d.id}`,
                templateId: d.templateId,
                title: d.title,
                people: d.people,
                amount: d.amount,
                reason: d.reason,
                // The whole point of the prompt: it takes an amount rather
                // than repeating last cycle's.
                askAmount: true,
                itemised: false,
                lines: 0,
              })}
            >
              Split it again
            </Button>
            {/* Snoozing re-ranks the list, so the prompt simply leaves the
                screen — the clearest possible confirmation. */}
            <Button onClick={() => snoozeTemplate(d.templateId)}>Not now</Button>
          </div>
        </article>
      ))}

      <QuickSplitSheet
        suggestion={active}
        onClose={() => setActive(null)}
        onLogged={onLogged}
      />
    </section>
  );
}
