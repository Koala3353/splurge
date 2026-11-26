import { isSettled } from '../../utils/split';
import { formatCurrency } from '../../utils/format';
import { useSettleLanding } from '../../hooks/useSettleLanding';
import Button from '../ui/Button.jsx';
import Row from '../ui/Row.jsx';
import Stamp from '../ui/Stamp.jsx';

/**
 * A saved crew, and the two things anyone opens one to do: start a bill with
 * everybody already on it, and chase whoever has not paid. A group that
 * cannot do either is just a label.
 *
 * You are a member of your own groups but never someone who owes yourself, so
 * your share is out of both the outstanding figure and the count.
 */
export default function GroupCard({ group, members, outstanding, owing, onSplit, onRemind }) {
  const clear = isSettled(outstanding);
  const landing = useSettleLanding(clear, group.id);

  const note = members.length
    ? `${members.length} ${members.length === 1 ? 'person' : 'people'}${
      owing > 0 ? ` · ${owing} still ${owing === 1 ? 'owes' : 'owe'} you` : ''
    }`
    : 'No members yet';

  return (
    <div style={{ paddingBlockEnd: 'var(--space-3)' }}>
      <h3 style={{ fontSize: 'var(--text-md)' }}>{group.name}</h3>
      <Row
        name={note}
        figure={formatCurrency(outstanding)}
        state={clear ? 'settled' : 'owed'}
        trailing={clear ? <Stamp status="settled" land={landing} /> : null}
      />
      <div className="u-row" style={{ gap: 'var(--space-2)', marginBlockStart: 'var(--space-2)' }}>
        <Button block disabled={members.length === 0} onClick={onSplit}>
          Split a bill
        </Button>
        <Button block disabled={owing === 0} onClick={onRemind}>
          Remind
        </Button>
      </div>
    </div>
  );
}
