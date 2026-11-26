import { useState } from 'react';
import { Check } from 'lucide-react';
import { useAppContext } from '../../store/AppContext';
import Sheet from '../ui/Sheet.jsx';
import Button from '../ui/Button.jsx';
import Field from '../ui/Field.jsx';

/**
 * Name a crew you split with often, and pick who is in it.
 *
 * Reads the roster off the context rather than taking it drilled: the page
 * above this one has no opinion about who can be in a group, and a prop it
 * only forwards is a prop that changes in two files.
 */
export default function NewGroupForm({ open, onClose }) {
  const { people, meId, addGroup } = useAppContext();
  const [name, setName] = useState('');
  const [selected, setSelected] = useState([]);

  const candidates = people.filter((p) => p.id !== meId);
  const trimmed = name.trim();
  const canCreate = trimmed.length > 0 && selected.length > 0;

  const toggle = (id) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const close = () => {
    setName('');
    setSelected([]);
    onClose();
  };

  const submit = (e) => {
    e.preventDefault();
    if (!canCreate) return;
    addGroup(trimmed, selected);
    close();
  };

  return (
    <Sheet
      open={open}
      title="New group"
      onClose={close}
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button variant="solid" disabled={!canCreate} onClick={submit}>
            Create group
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="u-stack-loose">
        <Field
          label="Group name"
          value={name}
          onChange={setName}
          placeholder="Barkada, Officemates"
          autoComplete="off"
          hint="What you would call them in a group chat."
        />

        <div>
          <h3 className="section__label">Who is in</h3>
          {candidates.length === 0 ? (
            <p className="u-ink-2" style={{ fontSize: 'var(--text-sm)' }}>
              Add some friends first, then group them.
            </p>
          ) : (
            <div className="chips">
              {/* Picked with the same chips the wizard uses to pick people.
                  These were receipt rows whose right-aligned figure read "In"
                  or "Out" — a control dressed as a printed fact, with no sign
                  it could be tapped, and a state labelled by two words that
                  are not opposites. A leader binds a name to an amount, and
                  membership is not an amount. Same task as step 1 of the
                  wizard, so the same vocabulary. */}
              {candidates.map((p) => {
                const on = selected.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    className="chip"
                    aria-pressed={on}
                    onClick={() => toggle(p.id)}
                  >
                    {on ? <Check size={20} strokeWidth={1.5} aria-hidden="true" /> : null}
                    {p.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {/* The footer carries the real submit; this keeps Enter working in the
            name field without shipping a second visible button. */}
        <button type="submit" className="u-sr-only" tabIndex={-1} aria-hidden="true">
          Create group
        </button>
      </form>
    </Sheet>
  );
}
