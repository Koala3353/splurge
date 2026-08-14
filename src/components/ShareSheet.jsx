import { useRef, useEffect, useState, useMemo } from 'react';
import { Check, Copy, Send, X } from 'lucide-react';
import { useAppContext } from '../store/AppContext';

// Labels live here so every share surface asks the same questions the same way.
const LEVEL_LABELS = {
  summary: 'Total only',
  bills: 'Per split',
  items: 'Every item',
};

const TOGGLES = {
  greeting: {
    label: 'Open with their name',
    hint: 'Starts the message with "Hey Marco,".',
  },
  showDates: {
    label: 'Date each split',
    hint: 'Useful when chasing something from weeks ago.',
  },
  showSharers: {
    label: 'Name who shared each item',
    hint: 'Shows who a line was split with, to head off "wait, why?".',
    // Nothing to attach names to until the message lists items.
    requires: (o) => o.detail === 'items',
  },
  showPaid: {
    label: 'Spell out the running total',
    hint: 'Makes clear the balance is what is left, not the full amount.',
  },
  showHistory: {
    label: 'List past splits',
    hint: "Includes splits they've already covered.",
  },
  showPayInfo: {
    label: 'Include how to pay you',
    hint: 'Adds your saved number to the end.',
  },
};

/**
 * Lets you shape an outbound message and read it back before it leaves the app,
 * because these get pasted into a group chat where you can't edit them after.
 * Choices persist, so the sheet is a one-time setup that stays reviewable.
 *
 * @param {Function} buildText - (options) => string, the live preview source
 * @param {string[]} levels    - detail steps to offer; omit to hide the control
 * @param {string[]} fields    - which toggles apply to this message
 */
export default function ShareSheet({
  open,
  title,
  actionLabel = 'Send',
  buildText,
  levels,
  fields = [],
  onClose,
}) {
  const dialogRef = useRef(null);
  const { shareOptions, setShareOptions, payInfo } = useAppContext();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  const handleClose = () => {
    setCopied(false);
    onClose();
  };

  const text = useMemo(
    () => (open && buildText ? buildText(shareOptions) : ''),
    [open, buildText, shareOptions],
  );

  const set = (patch) => setShareOptions((prev) => ({ ...prev, ...patch }));

  const send = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ text });
        // Closing fires onClose, which resets state through handleClose.
        dialogRef.current?.close();
      } catch {
        // Share sheet dismissed — leave this open so nothing is lost.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard unavailable — the preview above is still selectable.
    }
  };

  // Hide controls that can't do anything yet: "how to pay you" without a saved
  // number, "who shared each item" without items in the message.
  const visibleToggles = fields.filter((key) => {
    const t = TOGGLES[key];
    if (!t) return false;
    if (key === 'showPayInfo' && !payInfo?.number) return false;
    return t.requires ? t.requires(shareOptions) : true;
  });
  const canShare = typeof navigator !== 'undefined' && !!navigator.share;

  return (
    <dialog
      ref={dialogRef}
      onClose={handleClose}
      onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
      style={{ width: '95vw', maxWidth: '460px', padding: 0, overflow: 'hidden' }}
    >
      <div className="flex flex-col" style={{ maxHeight: '86vh' }}>
        <div className="p-4 border-b border-glass flex justify-between items-center">
          <div className="min-w-0">
            <h2 className="text-xl font-bold truncate">{title}</h2>
            <p className="text-xs text-secondary mt-1">Check it before it goes out.</p>
          </div>
          <form method="dialog">
            <button className="btn bg-glass p-2 rounded-full pressable" aria-label="Close">
              <X size={20} />
            </button>
          </form>
        </div>

        <div className="p-4 overflow-y-auto" style={{ flex: 1 }}>
          {/* Preview first: the message is the thing being decided. */}
          <div className="share-preview" aria-live="polite">
            <p key={text} className="share-preview-body">{text}</p>
          </div>

          {levels?.length > 1 && (
            <>
              <h3 className="share-group-label">Detail</h3>
              <div className="flex gap-2 flex-wrap mb-1" role="group" aria-label="Message detail">
                {levels.map((lvl) => {
                  const active = shareOptions.detail === lvl;
                  return (
                    <button
                      key={lvl}
                      type="button"
                      aria-pressed={active}
                      className={`pill ${active ? 'pill-active' : 'pill-inactive'} pressable`}
                      onClick={() => set({ detail: lvl })}
                    >
                      {LEVEL_LABELS[lvl] || lvl}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {visibleToggles.length > 0 && (
            <>
              <h3 className="share-group-label">Include</h3>
              <div className="share-rows">
                {visibleToggles.map((key) => {
                  const t = TOGGLES[key];
                  const on = !!shareOptions[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      role="switch"
                      aria-checked={on}
                      className="share-row pressable"
                      onClick={() => set({ [key]: !on })}
                    >
                      <span className="min-w-0">
                        <span className="share-row-label">{t.label}</span>
                        <span className="share-row-hint">{t.hint}</span>
                      </span>
                      <span className="switch" aria-hidden="true" data-on={on || undefined} />
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="p-4 border-t border-glass" style={{ flexShrink: 0 }}>
          <button className="btn btn-primary w-full pressable" onClick={send}>
            {copied
              ? <><Check size={18} /> Copied</>
              : canShare
                ? <><Send size={18} /> {actionLabel}</>
                : <><Copy size={18} /> Copy message</>}
          </button>
        </div>
      </div>
    </dialog>
  );
}
