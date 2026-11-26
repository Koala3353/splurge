import { Trash2 } from 'lucide-react';

/**
 * A row you can swipe aside to reveal one destructive action.
 *
 * Built on a scroll-snapping track rather than pointer maths: the browser
 * already knows how to carry a flick, rubber-band at the ends and respect the
 * user's scroll settings, and a hand-rolled version of that is where swipe
 * rows usually start fighting the page's own scroll.
 *
 * The action is a real button sitting behind the row, so it is reachable by
 * keyboard and by assistive tech without a swipe gesture at all — and it
 * names what goes, because "Delete" alone on a list of friends is not a
 * sentence anyone can act on confidently.
 */
export default function SwipeableItem({ children, actionLabel = 'Remove', onDelete }) {
  return (
    <li style={{ position: 'relative' }}>
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          scrollbarWidth: 'none',
          overscrollBehaviorX: 'contain',
        }}
      >
        <div
          style={{
            flex: '0 0 100%',
            minWidth: 0,
            scrollSnapAlign: 'start',
            background: 'var(--paper)',
          }}
        >
          {children}
        </div>
        {/* The window the action shows through. */}
        <div
          aria-hidden="true"
          style={{ flex: '0 0 calc(var(--control-min) * 2)', scrollSnapAlign: 'end' }}
        />
      </div>

      {/* After the row in the DOM so tabbing reaches the row first — the
          action is the rarer intent — and painted under it, so it is only
          reachable once the row has been swiped aside. */}
      <button
        type="button"
        onClick={onDelete}
        aria-label={actionLabel}
        style={{
          position: 'absolute',
          insetBlock: 0,
          insetInlineEnd: 0,
          zIndex: 0,
          display: 'inline-flex',
          width: 'calc(var(--control-min) * 2)',
          alignItems: 'center',
          justifyContent: 'center',
          border: 'var(--hairline) solid var(--ink-3)',
          borderRadius: 'var(--radius-press)',
          background: 'var(--paper-sunk)',
          color: 'var(--ink)',
        }}
      >
        <Trash2 size={24} strokeWidth={1.5} aria-hidden="true" />
      </button>
    </li>
  );
}
