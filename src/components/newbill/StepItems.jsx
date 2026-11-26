import { useId } from 'react';
import { Trash2 } from 'lucide-react';
import Button from '../ui/Button.jsx';
import WhoStrip from './WhoStrip.jsx';
import ScanProgress from './ScanProgress.jsx';
import ScanDiagnostics from '../ScanDiagnostics.jsx';
import { formatCurrency, PESO, initialsOf } from '../../utils/format';

/** Same set, order-independent — "is this line assigned like that one?". */
const sameSet = (a = [], b = []) => a.length === b.length && a.every((id) => b.includes(id));

/**
 * Step 2 — the lines, and who is on each.
 *
 * The measured bottleneck of the whole product lives on this screen, so the
 * accelerators are deliberately stacked: a person column (put one person on
 * every line at once), a drag that paints along a line, a one-tap repeat of
 * the line above, and Everyone as the first cell. Above them all sits the
 * count — "4 of 6 lines assigned" — because the old screen gave no sense of
 * where you were in an N×M grind.
 */
export default function StepItems({
  items,
  realCount,
  participants,
  nameOf,
  itemsTotal,
  assignedCount,
  scanning,
  scanShot,
  scanMessage,
  scanStep,
  scanCancelling,
  scanInfo,
  onScan,
  onRescan,
  onCancelScan,
  onItemField,
  onRemoveItem,
  onAddItem,
  onToggle,
  onEveryone,
  onCopyAssignment,
  onPersonColumn,
}) {
  const listId = useId();

  if (scanning) {
    return (
      <ScanProgress
        shot={scanShot}
        message={scanMessage}
        step={scanStep}
        cancelling={scanCancelling}
        onCancel={onCancelScan}
      />
    );
  }

  if (items.length === 0) {
    return (
      <div className="u-stack-loose">
        <section>
          <h2 className="section__heading">What did everyone get?</h2>
          <p className="u-ink-2">
            Photograph the receipt and the lines come back filled in, or type
            them yourself — both end up in the same place.
          </p>
          <div className="u-row" style={{ marginBlockStart: 'var(--space-4)' }}>
            <Button block onClick={() => onScan('camera')}>Take a photo</Button>
            <Button block onClick={() => onScan('library')}>Pick a photo</Button>
          </div>
          <Button
            variant="solid"
            block
            style={{ marginBlockStart: 'var(--space-3)' }}
            onClick={onAddItem}
          >
            Type the lines in
          </Button>
        </section>

        <section className="teach">
          <h3 className="section__label">About the scanner</h3>
          <p className="u-ink-2" style={{ fontSize: 'var(--text-sm)' }}>
            Measured against 60 photographed receipts, it recovers about 4 in
            10 lines and attaches the right price to about 8 of every 10 it
            finds. It is a head start on the typing, not a reading of the
            paper — you will be correcting some of it, and that is the normal
            way through.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="u-stack-loose">
      {scanInfo ? <ScanDiagnostics info={scanInfo} onRescan={onRescan} /> : null}

      <section aria-labelledby={`${listId}-label`}>
        <div className="u-between">
          <h2 className="section__label" id={`${listId}-label`} style={{ border: 0, marginBlockEnd: 0 }}>
            The lines
          </h2>
          <span className="figure">{formatCurrency(itemsTotal)}</span>
        </div>

        {/* Where you are in the grind, which the old screen never said. */}
        <p className="u-micro u-ink-2" role="status" style={{ marginBlock: 'var(--space-2)' }}>
          {assignedCount} of {realCount} lines assigned
        </p>

        {participants.length > 0 ? (
          <div className="chips" style={{ marginBlockEnd: 'var(--space-4)' }}>
            <span className="u-micro u-ink-3" style={{ alignSelf: 'center' }}>
              On every line:
            </span>
            {participants.map((id) => {
              const onAll = items.every((it) => it.people.includes(id));
              return (
                <button
                  key={id}
                  type="button"
                  className="chip"
                  aria-pressed={onAll}
                  onClick={() => onPersonColumn(id, !onAll)}
                >
                  <span aria-hidden="true" className="u-micro">{initialsOf(nameOf(id))}</span>
                  <span className="u-sr-only">
                    {`Put ${nameOf(id)} on every line`}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}

        <ul>
          {items.map((item, index) => {
            const prev = items[index - 1];
            const copyFrom = prev && !sameSet(prev.people, item.people) ? prev : null;
            return (
              <li key={item.id} className="line">
                <div className="line__edit">
                  <label className="u-sr-only" htmlFor={`${item.id}-name`}>
                    Line {index + 1} name
                  </label>
                  <input
                    id={`${item.id}-name`}
                    className="field__control line__name"
                    value={item.name}
                    placeholder="Sisig"
                    autoComplete="off"
                    onChange={(e) => onItemField(item.id, 'name', e.target.value)}
                  />
                  <div className="line__money">
                    <span className="line__peso" aria-hidden="true">{PESO}</span>
                    <label className="u-sr-only" htmlFor={`${item.id}-price`}>
                      Line {index + 1} price
                    </label>
                    <input
                      id={`${item.id}-price`}
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      className="field__control field__control--figure line__price"
                      value={item.price || ''}
                      placeholder="0"
                      onChange={(e) => onItemField(item.id, 'price', parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => onRemoveItem(item.id)}
                  >
                    <Trash2 size={24} strokeWidth={1.5} aria-hidden="true" />
                    <span className="u-sr-only">
                      {`Remove ${item.name.trim() || `line ${index + 1}`}`}
                    </span>
                  </button>
                </div>

                <WhoStrip
                  item={item}
                  participants={participants}
                  nameOf={nameOf}
                  onToggle={onToggle}
                  onEveryone={onEveryone}
                  copyFrom={copyFrom}
                  onCopy={() => onCopyAssignment(item.id, prev.people)}
                />
              </li>
            );
          })}
        </ul>

        <div className="u-row" style={{ marginBlockStart: 'var(--space-4)' }}>
          <Button block onClick={onAddItem}>Add a line</Button>
          <Button block onClick={scanInfo ? onRescan : () => onScan('camera')}>
            {scanInfo ? 'Scan again' : 'Scan a receipt'}
          </Button>
        </div>
      </section>
    </div>
  );
}
