/**
 * Toast — the one way anything reports after the fact.
 *
 *   <Toast message="Logged Sisig night" />
 *   <Toast message="Removed Ana" action="Undo" onAction={undoable.undo} />
 *
 * One vocabulary for a logged split, an undo window and the service worker's
 * "new version ready". `action` adds a button that meets the 44px floor, so
 * an undo is reachable rather than merely offered.
 *
 * role="status" (polite) for a report; the caller passes role="alert" only
 * when something actually went wrong.
 */
import Button from './ui/Button.jsx';

export default function Toast({
  message,
  action,
  onAction,
  onDismiss,
  role = 'status',
  className = '',
}) {
  if (!message) return null;

  return (
    <div className={['toast', className].filter(Boolean).join(' ')} role={role}>
      <span className="toast__text">{message}</span>
      {action ? (
        <Button variant="quiet" onClick={onAction}>
          {action}
        </Button>
      ) : null}
      {onDismiss ? (
        <button type="button" className="icon-btn" onClick={onDismiss}>
          <span aria-hidden="true">×</span>
          <span className="u-sr-only">Dismiss</span>
        </button>
      ) : null}
    </div>
  );
}
