import { useEffect, useRef, useState } from 'react';

// Mirrors --dur-stamp. The stamp is removed from the DOM-class a tick after
// the animation ends so a later settle can play it again.
const LAND_MS = 220;

/**
 * True for one animation's length when a balance crosses into settled.
 *
 * The stamp landing is one of only two authored motion moments in the product
 * — the moment a friend's debt closes. It has to play on the *transition*, not
 * on every render of a row that happens to be settled, or it stops meaning
 * anything. So: no landing on first paint, no landing when the row is reused
 * for a different person (hence `key`), one landing per close.
 *
 * Reduced motion needs no branch here: `.stamp--lands` collapses to an opacity
 * fade in utilities.css, which is the last layer and cannot be out-specified.
 *
 * @param {boolean} settled is the balance settled right now
 * @param {string}  key     identity of the thing being watched (a person id)
 */
export function useSettleLanding(settled, key) {
  const [landing, setLanding] = useState(false);
  const prevSettled = useRef(settled);
  const prevKey = useRef(key);

  useEffect(() => {
    // A row recycled for someone else is not a debt closing.
    if (key !== prevKey.current) {
      prevKey.current = key;
      prevSettled.current = settled;
      setLanding(false);
      return undefined;
    }

    const crossed = settled && !prevSettled.current;
    prevSettled.current = settled;
    if (!crossed) return undefined;

    setLanding(true);
    const timer = setTimeout(() => setLanding(false), LAND_MS);
    return () => clearTimeout(timer);
  }, [settled, key]);

  return landing;
}
