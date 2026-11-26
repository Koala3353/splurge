import { useCallback, useMemo, useRef, useState } from 'react';
import { useAppContext } from '../store/AppContext';
import Sheet from './ui/Sheet.jsx';
import Button from './ui/Button.jsx';
import Row from './ui/Row.jsx';
import ScopeChips from './share/ScopeChips.jsx';
import ToggleRow from './share/ToggleRow.jsx';
import ReceiptImage from './share/ReceiptImage.jsx';
import { canNativeShare, copyText, isAbort } from './share/send';
import './share/share.css';

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

// What the last send actually did. Shown verbatim, because a button that
// says "Copied" over a clipboard that is empty is worse than no button.
const STATUS = {
  copied: 'Copied. Paste it into the chat.',
  copyBlocked:
    'This browser will not let the app copy for you. Select the message above and copy it by hand.',
  sharedFailed: 'Sharing did not work, so the message is on your clipboard instead.',
  stuck:
    'Sharing did not work and this browser will not let the app copy. Select the message above and copy it by hand.',
};

/**
 * Shape an outbound message and read it back before it leaves the app, because
 * these get pasted into a group chat where you cannot edit them after.
 *
 * The message templates are not written here and are not rewritten here —
 * shareText.js owns the words, is tested against machine-written tells, and
 * reads like a person. This is only the surface around them.
 *
 * Sending, not copying, is the point. This is a Philippine bill splitter:
 * the money moves over GCash and the ask moves over WhatsApp, Messenger,
 * Viber or SMS, which is what the native share sheet is for. Copying is kept
 * as the always-there second route — for a desktop browser with no share
 * support, and for the phone-testing origins where the clipboard API itself
 * is missing. See share/send.js for why the call shapes are what they are.
 *
 * `scopes` is what flattened the reminder flow: picking who a reminder goes to
 * used to be a dialog in front of this one, which made a single decision three
 * modals deep. It is one chip set at the top of the preview now.
 *
 * @param {Function} buildText  - (options) => string, the live preview source
 * @param {string[]} levels     - detail steps to offer; omit to hide the control
 * @param {string[]} fields     - which toggles apply to this message
 * @param {Array}    scopes     - [{ id, label, count }] audiences, optional
 * @param {Array}    recipients - [{ id, name, amount, buildText }] one-by-one sends
 * @param {object}   receipt    - { bill, dues, nameOf, meId } to also offer the
 *                                split as a receipt image; omit and the sheet
 *                                is the message alone, as it was.
 * @param {string[]} nudgeIds   - who the main message chases. Reported to
 *                                `onSent` when, and only when, it really left.
 * @param {Function} onSent     - (ids) => void. Called on a send or copy that
 *                                SUCCEEDED. Not on open, and not on
 *                                AbortError, which is the user backing out of
 *                                the native sheet with nothing sent.
 */
export default function ShareSheet({
  open,
  title,
  actionLabel = 'Send',
  buildText,
  levels,
  fields = [],
  scopes,
  activeScopeId,
  onScope,
  recipients,
  receipt,
  nudgeIds,
  onSent,
  onClose,
}) {
  const { shareOptions, setShareOptions, payInfo } = useAppContext();
  const [status, setStatus] = useState('');
  const [sending, setSending] = useState(false);
  // Set while a send is in flight so a late resolution cannot write a status
  // onto a sheet the user has already closed.
  const liveRef = useRef(true);

  const text = useMemo(
    () => (open && buildText ? buildText(shareOptions) : ''),
    [open, buildText, shareOptions],
  );

  const set = (patch) => {
    setStatus('');
    setShareOptions((prev) => ({ ...prev, ...patch }));
  };

  const close = useCallback(() => {
    liveRef.current = false;
    setStatus('');
    setSending(false);
    onClose();
  }, [onClose]);

  /**
   * The one place a reminder is counted as sent.
   *
   * Called from the two outcomes that mean the message actually left the app
   * — the native share resolved, or the text really landed on the clipboard.
   * Opening the sheet, reading the preview, flipping a toggle and dismissing
   * the native sheet all leave the record alone, because none of them put the
   * message in front of anyone.
   */
  const markSent = useCallback(
    (ids) => {
      const list = ids ?? nudgeIds;
      if (!onSent || !list?.length) return;
      onSent(list);
    },
    [onSent, nudgeIds],
  );

  const copy = useCallback(
    (body, { afterShare = false, ids } = {}) => {
      liveRef.current = true;
      setSending(true);
      return copyText(body).then((ok) => {
        // The copy is what counts, not whether the sheet is still open: a
        // clipboard write that landed after a close still landed.
        if (ok) markSent(ids);
        if (!liveRef.current) return ok;
        setSending(false);
        if (ok) setStatus(afterShare ? STATUS.sharedFailed : STATUS.copied);
        else setStatus(afterShare ? STATUS.stuck : STATUS.copyBlocked);
        return ok;
      });
    },
    [markSent],
  );

  /**
   * The gesture handler. `navigator.share` is called on the first line with
   * nothing awaited in front of it, because iOS Safari ties the permission to
   * the tap and refuses the call the moment it is reached from a microtask.
   */
  const send = useCallback(
    (body, { closeOnSuccess = true, ids } = {}) => {
      if (!body) return;
      liveRef.current = true;

      if (canNativeShare(body)) {
        let pending;
        try {
          pending = navigator.share({ text: body });
        } catch (err) {
          // Threw rather than rejected — same two cases, same handling.
          if (!isAbort(err)) copy(body, { afterShare: true, ids });
          return;
        }
        setStatus('');
        setSending(true);
        pending.then(
          () => {
            // Marked before the liveRef guard and before the close: the
            // message went out, whatever the sheet is doing now.
            markSent(ids);
            if (!liveRef.current) return;
            setSending(false);
            if (closeOnSuccess) close();
          },
          (err) => {
            if (!liveRef.current) return;
            setSending(false);
            // The user backed out of the native sheet. Nothing failed, so
            // nothing is said, nothing changes, and — the whole point — no
            // reminder is recorded against anybody.
            if (isAbort(err)) return;
            copy(body, { afterShare: true, ids });
          },
        );
        return;
      }

      copy(body, { ids });
    },
    [close, copy, markSent],
  );

  // Hide controls that cannot do anything yet: "how to pay you" without a
  // saved number, "who shared each item" without items in the message.
  const visibleToggles = fields.filter((key) => {
    const t = TOGGLES[key];
    if (!t) return false;
    if (key === 'showPayInfo' && !payInfo?.number) return false;
    return t.requires ? t.requires(shareOptions) : true;
  });

  const shareable = canNativeShare(text);
  // One friend, one message. Sent straight from the row's own tap, so the
  // gesture reaching navigator.share is the tap on that person's name.
  const oneByOne = recipients?.length > 1 ? recipients : null;

  return (
    <Sheet
      open={open}
      title={title}
      onClose={close}
      footer={
        shareable ? (
          <>
            <Button disabled={!text} onClick={() => copy(text)}>
              Copy message
            </Button>
            <Button
              variant="solid"
              loading={sending}
              disabled={!text}
              onClick={() => send(text)}
            >
              {actionLabel}
            </Button>
          </>
        ) : (
          <Button
            variant="solid"
            loading={sending}
            disabled={!text}
            onClick={() => copy(text)}
          >
            Copy message
          </Button>
        )
      }
    >
      <div className="u-stack-loose">
        {scopes?.length > 1 ? (
          <section>
            <h3 className="section__label">Who it goes to</h3>
            <ScopeChips
              scopes={scopes}
              activeId={activeScopeId}
              label="Who it goes to"
              onPick={(scope) => {
                setStatus('');
                onScope?.(scope);
              }}
            />
          </section>
        ) : null}

        {/* The message is the thing being decided, so it comes first. */}
        <section>
          <h3 className="section__label">The message</h3>
          <p
            aria-live="polite"
            className="u-mono"
            style={{
              margin: 0,
              maxWidth: 'none',
              padding: 'var(--space-4)',
              background: 'var(--paper-sunk)',
              borderBlockStart: 'var(--hairline) solid var(--rule-strong)',
              borderBlockEnd: 'var(--hairline) solid var(--rule-strong)',
              fontSize: 'var(--text-sm)',
              lineHeight: 'var(--leading-snug)',
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
            }}
          >
            {text}
          </p>
          <p className="share__status" role="status">
            {status}
          </p>
        </section>

        {/* Second route, deliberately not the default — see ReceiptImage.
            Mounted only while the sheet is open, which is what makes the
            payment-number opt-in a per-send decision rather than a setting. */}
        {open && receipt ? <ReceiptImage receipt={receipt} payInfo={payInfo} /> : null}

        {oneByOne ? (
          <section>
            <h3 className="section__label">Or send it one at a time</h3>
            <p className="u-ink-2" style={{ fontSize: 'var(--text-sm)', margin: 0 }}>
              Tap a name to {shareable ? 'send' : 'copy'} that person their own
              message, with only their share in it.
            </p>
            <ul style={{ marginBlockStart: 'var(--space-3)' }}>
              {oneByOne.map((person) => (
                <li key={person.id}>
                  <Row
                    name={person.name}
                    // When this one was last chased, where the choice of whom
                    // to tap is actually being made.
                    note={person.note}
                    figure={person.figure}
                    state="owed"
                    onClick={() => send(person.buildText(shareOptions), {
                      closeOnSuccess: false,
                      ids: [person.id],
                    })}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {levels?.length > 1 ? (
          <section>
            <h3 className="section__label">How much detail</h3>
            <div className="chips" role="group" aria-label="How much detail">
              {levels.map((lvl) => {
                const active = shareOptions.detail === lvl;
                return (
                  <button
                    key={lvl}
                    type="button"
                    className="chip"
                    aria-pressed={active}
                    onClick={() => set({ detail: lvl })}
                  >
                    <span className="chip__label">{LEVEL_LABELS[lvl] || lvl}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        {visibleToggles.length > 0 ? (
          <section>
            <h3 className="section__label">What to include</h3>
            <ul className="toggles">
              {visibleToggles.map((key) => {
                const t = TOGGLES[key];
                return (
                  <li key={key}>
                    <ToggleRow
                      label={t.label}
                      hint={t.hint}
                      checked={!!shareOptions[key]}
                      onChange={(next) => set({ [key]: next })}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </div>
    </Sheet>
  );
}
