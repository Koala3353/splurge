/**
 * The image half of the share sheet: a split drawn as a printed receipt, with
 * a real preview of the thing that will be posted.
 *
 * Three decisions are load-bearing here.
 *
 * 1. THE IMAGE IS NOT THE DEFAULT. The written message is the product's best
 *    asset — it is the thing a friend can read, reply to and pay from without
 *    opening anything. The image is the second route, for the group chat where
 *    a picture gets looked at and a wall of text does not. So it sits in its
 *    own section with a quiet button, and the solid one in the footer still
 *    sends the words.
 *
 * 2. THE PNG IS DRAWN BEFORE THE TAP. `navigator.share` has to be reached
 *    synchronously from the gesture — iOS Safari rejects it the moment an
 *    `await` sits in between — and drawing a receipt is async (fonts, then
 *    `toBlob`). So generation starts the moment the sheet opens, and the
 *    handler only wraps an already-resolved blob in a File and shares it.
 *    That is also why the button is disabled while it draws rather than
 *    queuing the work behind the tap.
 *
 * 3. THE COMPONENT IS MOUNTED ONLY WHILE THE SHEET IS OPEN, so every piece of
 *    state here — the drawn sheet, the object URL, and the decision about the
 *    payment number — is forgotten on close. A choice to put a live account
 *    number on a picture is made per send, never inherited from the last one.
 *
 * The preview is also the privacy control: the only honest way to let someone
 * decide what goes on a forwardable image is to show them it both ways.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Button from '../ui/Button.jsx';
import ToggleRow from './ToggleRow.jsx';
import { isAbort } from './send';
import {
  canShareImage,
  downloadImage,
  fileFrom,
  renderReceiptImage,
} from '../../utils/receiptImage';

const NOTES = {
  drawing: 'Drawing the receipt.',
  failed: 'The image could not be drawn, so the message above is the way to send this.',
  saved: 'Saved to your downloads.',
  shareFailed: 'Sharing did not work, so the image was saved to your downloads instead.',
  fallbackFont:
    'Geist Mono did not load, so the figures are in this device’s own monospace face.',
};

export default function ReceiptImage({ receipt, payInfo }) {
  const [includePay, setIncludePay] = useState(false);
  // Everything below is keyed by the signature it was produced for, so a
  // result from a superseded draw can never be shown next to a newer preview.
  const [shot, setShot] = useState(null);
  const [failedKey, setFailedKey] = useState(null);
  const [note, setNote] = useState(null);
  const urlRef = useRef(null);

  const hasNumber = !!payInfo?.number;
  const bill = receipt?.bill;
  const dues = receipt?.dues;

  // The caller passes a fresh object every render, so the work is keyed on
  // what the image actually depends on rather than on object identity.
  const signature = useMemo(() => {
    if (!bill) return null;
    return [
      bill.id,
      bill.title,
      bill.date,
      (bill.items || []).length,
      (bill.fees || []).length,
      (bill.participants || []).length,
      Object.values(dues || {}).join(','),
      includePay ? 'pay' : 'nopay',
    ].join('|');
  }, [bill, dues, includePay]);

  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
  }, []);

  useEffect(() => {
    if (!signature || !bill) return undefined;
    let live = true;

    renderReceiptImage({
      bill,
      dues,
      nameOf: receipt.nameOf,
      meId: receipt.meId,
      total: receipt.total,
      payInfo,
      includePayInfo: includePay,
    }).then(
      (next) => {
        if (!live) {
          URL.revokeObjectURL(next.url);
          return;
        }
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = next.url;
        setShot({ key: signature, ...next });
        if (!next.monoVerified) setNote({ key: signature, text: NOTES.fallbackFont });
      },
      () => {
        if (live) setFailedKey(signature);
      },
    );

    return () => {
      live = false;
    };
    // `signature` names every input the drawing depends on; the rest are read
    // through it, and re-running on their identity would redraw every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const ready = shot?.key === signature ? shot : null;
  const failed = failedKey === signature;
  const drawing = !ready && !failed;
  const message = failed ? NOTES.failed : note?.key === signature ? note.text : '';

  const file = useMemo(
    () => (ready ? fileFrom(ready.blob, ready.fileName) : null),
    [ready],
  );
  const shareable = canShareImage(file);

  /** The gesture handler. Nothing is awaited in front of `navigator.share`. */
  const send = useCallback(() => {
    if (!ready) return;
    const fail = (text) => setNote({ key: ready.key, text });

    if (shareable && file) {
      let pending;
      try {
        pending = navigator.share({ files: [file] });
      } catch (err) {
        // Threw rather than rejected — same two cases, same handling.
        if (!isAbort(err)) {
          downloadImage(ready.blob, ready.fileName);
          fail(NOTES.shareFailed);
        }
        return;
      }
      setNote(null);
      pending.then(
        () => {},
        (err) => {
          // Backed out of the native sheet. Nothing failed, so nothing is said.
          if (isAbort(err)) return;
          downloadImage(ready.blob, ready.fileName);
          fail(NOTES.shareFailed);
        },
      );
      return;
    }

    if (downloadImage(ready.blob, ready.fileName)) fail(NOTES.saved);
  }, [file, ready, shareable]);

  if (!bill) return null;

  return (
    <section>
      <h3 className="section__label">Or post the receipt</h3>
      <p className="u-ink-2" style={{ fontSize: 'var(--text-sm)', margin: 0 }}>
        The same split as a picture, for the group chat where nobody reads the
        long message.
      </p>

      <div className="shot">
        {ready ? (
          <img
            className="shot__sheet"
            src={ready.url}
            width={ready.cssWidth}
            alt={`${bill.title || 'The split'} as a printed receipt: every item, the total, and what each person owes.`}
          />
        ) : (
          <p className="shot__pending" aria-live="polite">
            {drawing ? NOTES.drawing : NOTES.failed}
          </p>
        )}
      </div>

      {hasNumber ? (
        <ul className="toggles" style={{ marginBlockStart: 'var(--space-3)' }}>
          <li>
            <ToggleRow
              label="Put your number on the image"
              hint="A picture gets forwarded further than a message does. Off unless you say so."
              checked={includePay}
              onChange={setIncludePay}
            />
          </li>
        </ul>
      ) : null}

      <p className="share__status" role="status">
        {ready ? message : ''}
      </p>

      <Button block loading={drawing} disabled={!ready} onClick={send}>
        {shareable ? 'Send the image' : 'Save the image'}
      </Button>
    </section>
  );
}
