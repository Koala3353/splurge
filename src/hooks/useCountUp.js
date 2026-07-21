import { useEffect, useRef, useState } from 'react';

const EASE = (t) => 1 - Math.pow(1 - t, 3);

// Animates a number from its previous value to `target` over `duration`ms.
// Respects prefers-reduced-motion by jumping straight to the target.
export function useCountUp(target, duration = 700) {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const frameRef = useRef(null);

  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || !Number.isFinite(target)) {
      fromRef.current = target;
      frameRef.current = requestAnimationFrame(() => setValue(target));
      return () => cancelAnimationFrame(frameRef.current);
    }

    const start = performance.now();
    cancelAnimationFrame(frameRef.current);

    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      setValue(from + (target - from) * EASE(t));
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };
    frameRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frameRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return value;
}
