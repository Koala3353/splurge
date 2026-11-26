import { useState } from 'react';
import Sheet from '../ui/Sheet.jsx';
import Button from '../ui/Button.jsx';
import Field from '../ui/Field.jsx';
import Row from '../ui/Row.jsx';
import { computeBillDues } from '../../utils/split';
import { formatCurrency } from '../../utils/format';

/**
 * One amount, split evenly, saved. The whole wizard in a single field.
 *
 * The shares are computed by `computeBillDues`, not by dividing here — ten
 * pesos three ways is 3.34 / 3.33 / 3.33, and the only way the preview, the
 * stored bill and the outbound message agree is if all three ask the same
 * function.
 */
export default function EvenSplitSheet({
  open, onClose, title, participants, nameOf, meId, onSave,
}) {
  const [amount, setAmount] = useState('');

  const value = parseFloat(amount);
  const valid = Number.isFinite(value) && value > 0;

  const { dues } = computeBillDues(
    {
      participants,
      fees: [],
      items: [{ id: 'even', price: valid ? value : 0, people: participants }],
    },
    { meId },
  );

  const close = () => {
    setAmount('');
    onClose();
  };

  const save = () => {
    if (!valid) return;
    onSave(value);
    setAmount('');
  };

  return (
    <Sheet
      open={open}
      title="Split it evenly"
      onClose={close}
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button variant="solid" disabled={!valid} onClick={save}>
            Save the split
          </Button>
        </>
      }
    >
      <div className="u-stack-loose">
        <Field
          label={`What did ${title.trim() || 'it'} come to?`}
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          figure
          value={amount}
          onChange={setAmount}
          placeholder="2480.50"
          autoFocus
          hint={`Split ${participants.length === 1 ? '1 way' : `${participants.length} ways`}. Centavos land on whoever paid.`}
        />

        <section>
          <h3 className="section__label">Each person</h3>
          <ul>
            {participants.map((id) => (
              <li key={id}>
                <Row
                  name={`${nameOf(id)}${id === meId ? ' (you)' : ''}`}
                  figure={formatCurrency(dues[id] || 0)}
                />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Sheet>
  );
}
