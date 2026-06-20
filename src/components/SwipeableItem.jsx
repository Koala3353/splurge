import { Trash2 } from 'lucide-react';
import { useRef, useEffect } from 'react';

export default function SwipeableItem({ children, onDelete }) {
  const trackRef = useRef(null);

  // Fallback programmatic scroll to initial position if scroll-initial-target is not supported
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const needsScrollWorkaround = !CSS.supports('scroll-initial-target', 'nearest');
    if (needsScrollWorkaround) {
      // Content is at 0, spacer is at right. Initial is 0, so no scroll needed.
      // Wait, the content is the first grid column, so it starts fully visible.
      // No workaround needed for left-aligned content.
    }
  }, []);

  return (
    <div className="SwipeableList-item">
      <div className="SwipeableList-track" ref={trackRef}>
        <div className="SwipeableList-content">
          {children}
        </div>
      </div>
      <button className="SwipeableList-action" onClick={onDelete} aria-label="Delete">
        <Trash2 size={24} />
      </button>
    </div>
  );
}
