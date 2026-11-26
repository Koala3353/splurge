import Button from '../ui/Button.jsx';

/**
 * The way back from a destructive action.
 *
 * Deleting a person took their balance history with it and asked nothing; a
 * confirm dialog in front of every swipe would tax the common case to guard
 * the rare one. This is the other answer: the delete happens, and for five
 * seconds it is one tap from not having happened.
 *
 * role="status" so the removal is announced without stealing focus — the
 * swipe that caused it is still under the user's thumb.
 */
export default function UndoToast({ pending, onUndo, onDismiss }) {
  if (!pending) return null;

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        insetInline: 'var(--space-4)',
        bottom: 'calc(var(--space-8) + env(safe-area-inset-bottom, 0px))',
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--space-3)',
        maxWidth: 'var(--column)',
        marginInline: 'auto',
        padding: 'var(--space-2) var(--space-2) var(--space-2) var(--space-4)',
        background: 'var(--paper-raised)',
        border: 'var(--hairline) solid var(--rule-strong)',
        borderRadius: 'var(--radius-press)',
        boxShadow: 'var(--shadow-lift)',
      }}
    >
      <span style={{ fontSize: 'var(--text-sm)', minWidth: 0 }}>{pending.label}</span>
      <span className="u-row" style={{ gap: 'var(--space-1)', flexShrink: 0 }}>
        <Button onClick={onUndo}>Undo</Button>
        <Button
          onClick={onDismiss}
          aria-label="Dismiss"
          style={{ paddingInline: 'var(--space-3)' }}
        >
          OK
        </Button>
      </span>
    </div>
  );
}
