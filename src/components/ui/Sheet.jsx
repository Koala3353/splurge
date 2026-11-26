/**
 * Sheet — the one bottom-sheet/dialog in the app.
 *
 *   <Sheet open={open} title="Add an item" size="md" onClose={close}
 *          footer={<Button onClick={save}>Save</Button>}>
 *     …body…
 *   </Sheet>
 *
 * Replaces five hand-rolled <dialog> implementations that had drifted to
 * three widths and two max-heights, with the same open/close effect written
 * out five times and the backdrop-click closer nine. Open/close, Escape,
 * backdrop click, body scroll lock and the native `close` event are handled
 * here once and nowhere else.
 *
 * Native <dialog> + showModal() is kept deliberately: the audit verified that
 * the old dialogs' focus trapping was genuinely correct, and this is where it
 * came from. onClose is called for every route out — button, Escape, backdrop
 * — so a caller never has to handle one of them separately.
 */
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

const SIZES = { sm: 'sheet--sm', md: '', lg: 'sheet--lg' };

export default function Sheet({ open, title, size = 'md', onClose, footer, children }) {
  const ref = useRef(null);
  // Held in a ref so the open/close effect does not re-run — and re-animate —
  // every time the parent re-renders with a fresh onClose closure.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();

    if (!open) return undefined;

    // Escape and the close button both fire the native `close` event, so one
    // listener covers every exit the browser can produce.
    const onNativeClose = () => onCloseRef.current?.();
    el.addEventListener('close', onNativeClose);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      el.removeEventListener('close', onNativeClose);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // The dialog element fills the viewport, so a click that lands on the
  // element itself rather than on its content is a click on the backdrop.
  const onBackdrop = (e) => {
    if (e.target === ref.current) ref.current.close();
  };

  return (
    <dialog
      ref={ref}
      className={['sheet', SIZES[size] ?? ''].filter(Boolean).join(' ')}
      aria-label={title}
      onClick={onBackdrop}
    >
      <header className="sheet__header">
        <h2 className="sheet__title">{title}</h2>
        <button
          type="button"
          className="sheet__close"
          onClick={() => ref.current?.close()}
        >
          <X size={24} strokeWidth={1.5} aria-hidden="true" />
          <span className="u-sr-only">Close</span>
        </button>
      </header>

      <div className="sheet__body">{children}</div>

      {footer ? <footer className="sheet__footer">{footer}</footer> : null}
    </dialog>
  );
}
