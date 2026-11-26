import { useState } from 'react';
import Button from '../ui/Button.jsx';
import Field from '../ui/Field.jsx';

/**
 * Step 1 — what this was, and who is on it.
 *
 * Three things the audit found missing are here rather than elsewhere:
 *
 *  - **Groups are made where the need is felt.** A crew could only be created
 *    from an unlabelled control on the People tab, which is never where you
 *    are standing when you notice you split with these four every week.
 *  - **The even split is a route, not a consolation.** "Just split this,
 *    evenly, now" is the single most common real event and had no fast path
 *    at all unless you happened to have two identical splits behind you.
 *  - **"This is me" is offered in the flow**, because a user who types their
 *    own name like any other friend is invoiced for their own dinner in
 *    every message the app sends.
 */
export default function StepPeople({
  people,
  groups,
  meId,
  splitName,
  onName,
  selected,
  onToggle,
  onAddGroupPeople,
  onAddPerson,
  onAddMe,
  onNewGroup,
  onEvenSplit,
}) {
  const [draftName, setDraftName] = useState('');

  const addPerson = (e) => {
    e.preventDefault();
    const name = draftName.trim();
    if (!name) return;
    onAddPerson(name);
    setDraftName('');
  };

  const meSelected = meId ? selected.includes(meId) : false;

  return (
    <div className="u-stack-loose">
      <section>
        <h2 className="u-sr-only">What this was</h2>
        <Field
          label="Name this split"
          value={splitName}
          onChange={onName}
          placeholder="Friday dinner at Mang Inasal"
          autoComplete="off"
          hint="Optional. It is what everyone sees in the message."
        />
      </section>

      {groups.length > 0 ? (
        <section>
          <h2 className="section__label">Your crews</h2>
          <div className="chips">
            {groups.map((group) => (
              <button
                key={group.id}
                type="button"
                className="chip"
                onClick={() => onAddGroupPeople(group.peopleIds)}
              >
                {group.name}
                <span className="u-micro u-ink-3" aria-hidden="true">
                  {group.peopleIds.length}
                </span>
                <span className="u-sr-only">
                  {`, ${group.peopleIds.length} ${group.peopleIds.length === 1 ? 'person' : 'people'}`}
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="section__label">Who is in</h2>

        {people.length === 0 ? (
          <p className="u-ink-2">
            Nobody on file yet. Add the people at the table — they stay, and
            every split you put against them keeps a running balance.
          </p>
        ) : (
          <div className="chips">
            {people.map((person) => {
              const on = selected.includes(person.id);
              return (
                <button
                  key={person.id}
                  type="button"
                  className="chip"
                  aria-pressed={on}
                  onClick={() => onToggle(person.id)}
                >
                  {person.name}
                  {person.id === meId ? ' (you)' : ''}
                </button>
              );
            })}
          </div>
        )}

        <form onSubmit={addPerson} className="u-row" style={{ alignItems: 'flex-end', marginBlockStart: 'var(--space-4)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Field
              label="Someone new"
              value={draftName}
              onChange={setDraftName}
              placeholder="Jericho"
              autoComplete="off"
            />
          </div>
          <Button type="submit" disabled={draftName.trim().length === 0}>
            Add
          </Button>
        </form>

        <div className="u-row" style={{ flexWrap: 'wrap', marginBlockStart: 'var(--space-3)' }}>
          {meSelected ? (
            <span className="u-micro u-ink-2">You are on this split</span>
          ) : (
            <Button onClick={onAddMe}>Put me on it</Button>
          )}
          <Button onClick={onNewGroup} disabled={people.length === 0}>
            Save as a group
          </Button>
        </div>
      </section>

      {/* The fast path. Most splits are not itemised — one person paid for everything
          and the rest owe a quarter each — and that case had to walk the
          whole wizard to get there. */}
      <section className="notice">
        <h2 className="notice__title">Splitting it evenly?</h2>
        <p className="notice__body">
          Type one amount and it is done — no items, no assignment. You can
          still itemise it later from the split itself.
        </p>
        <div className="notice__chips">
          <Button block onClick={onEvenSplit} disabled={selected.length === 0}>
            Split one amount evenly
          </Button>
        </div>
      </section>
    </div>
  );
}
