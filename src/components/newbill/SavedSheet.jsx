import { useCallback, useState } from 'react';
import { useAppContext } from '../../store/AppContext';
import Sheet from '../ui/Sheet.jsx';
import Button from '../ui/Button.jsx';
import Row from '../ui/Row.jsx';
import ShareSheet from '../ShareSheet.jsx';
import { formatCurrency } from '../../utils/format';

/**
 * Where the wizard ends.
 *
 * Saving used to drop the user back on Home with no acknowledgement, and
 * asking for the money then cost four more taps through three stacked
 * modals — for the thing they had just spent thirty taps preparing. The
 * message is one tap from here, and the words are shareText.js's, not ours.
 */
export default function SavedSheet({
  open, title, participants, nameOf, meId, dues, onDone,
}) {
  const { buildGroupReminderText } = useAppContext();
  const [shareOpen, setShareOpen] = useState(false);

  const others = participants.filter((id) => id !== meId);

  const buildText = useCallback(
    (options) => buildGroupReminderText({ peopleIds: others, label: title }, options),
    [buildGroupReminderText, others, title],
  );

  return (
    <>
      <Sheet
        open={open && !shareOpen}
        title={title.trim() ? `${title.trim()} is saved` : 'Split saved'}
        onClose={onDone}
        footer={
          <>
            <Button onClick={onDone}>Done</Button>
            <Button
              variant="solid"
              disabled={others.length === 0}
              onClick={() => setShareOpen(true)}
            >
              Send shares
            </Button>
          </>
        }
      >
        <div className="u-stack">
          <p className="u-ink-2">
            It is on your list and on each person&apos;s balance. Tick them off
            from the People tab as the money comes in.
          </p>
          <ul>
            {participants.map((id) => (
              <li key={id}>
                <Row
                  name={`${nameOf(id)}${id === meId ? ' (you)' : ''}`}
                  figure={formatCurrency(dues[id] || 0)}
                  state={id === meId ? 'default' : 'owed'}
                />
              </li>
            ))}
          </ul>
        </div>
      </Sheet>

      <ShareSheet
        open={shareOpen}
        title="Send their shares"
        actionLabel="Post the message"
        buildText={buildText}
        fields={['showPaid', 'showPayInfo']}
        onClose={() => setShareOpen(false)}
      />
    </>
  );
}
