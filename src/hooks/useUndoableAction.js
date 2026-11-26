import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Do something destructive now, and keep the way back open for a few seconds.
 *
 * Deleting a person or a group is instant and takes their balance history with
 * it. A confirm dialog in front of every swipe would tax the common case to
 * guard the rare one; a short undo window taxes nothing and is the same
 * primitive the payment undo already uses.
 *
 * Usage (the People page wiring, once the UI lands):
 *
 *   const undoable = useUndoableAction();
 *   // ...
 *   undoable.run({
 *     label: `Removed ${person.name}`,
 *     act: () => removePerson(person.id),   // returns a snapshot
 *     undo: (snapshot) => restorePerson(snapshot),
 *   });
 *   // then render the toast from `undoable.pending`:
 *   {undoable.pending && (
 *     <div className="toast">
 *       {undoable.pending.label}
 *       <button onClick={undoable.undo}>Undo</button>
 *     </div>
 *   )}
 *
 * `act` runs immediately and whatever it returns is handed back to `undo`.
 * Returning null/undefined means nothing happened, and no undo is offered.
 * Starting a second action commits the first one — the window is for the last
 * thing you did, not a stack.
 *
 * @param {number} [timeout=5000] how long the undo stays available, in ms
 */
export function useUndoableAction(timeout = 5000) {
  // { label, token, undo } — the action currently inside its undo window.
  const [pending, setPending] = useState(null);
  const timerRef = useRef(null);
  // Mirrors `pending` so undo can read it without a state updater — an updater
  // that calls `undo` would run it twice under StrictMode's double invoke.
  const pendingRef = useRef(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const run = useCallback(({ label, act, undo }) => {
    clearTimer();
    const token = act?.();
    if (token === null || token === undefined) {
      pendingRef.current = null;
      setPending(null);
      return null;
    }
    pendingRef.current = { label, token, undo };
    setPending(pendingRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      pendingRef.current = null;
      setPending(null);
    }, timeout);
    return token;
  }, [clearTimer, timeout]);

  const undo = useCallback(() => {
    clearTimer();
    const current = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    current?.undo?.(current.token);
  }, [clearTimer]);

  /** Let the window close now without undoing — e.g. the user dismissed the toast. */
  const dismiss = useCallback(() => {
    clearTimer();
    pendingRef.current = null;
    setPending(null);
  }, [clearTimer]);

  return { pending, run, undo, dismiss };
}
