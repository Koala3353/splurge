/**
 * "New version ready — reload."
 *
 * skipWaiting() was removed from the service worker so assets are never
 * swapped under a live page. The cost of that correctness is that a new
 * version now sits in `waiting` until every tab of the app closes, and
 * nothing told the user it was there — so a fix could ship and never arrive.
 *
 * This watches the registration for a worker that has finished installing
 * behind a controlled page, and offers the reload in the ordinary toast
 * vocabulary. Reload is the user's call, not ours: taking a page out from
 * under someone mid-split is exactly what skipWaiting() was removed to stop.
 */
import { useEffect, useState } from 'react';
import Toast from './Toast.jsx';

export default function UpdatePrompt() {
  const [waiting, setWaiting] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;

    let cancelled = false;
    const cleanups = [];

    navigator.serviceWorker.ready
      .then((reg) => {
        if (cancelled) return;

        // A worker already waiting when this mounted (the common case: the
        // update downloaded during the previous visit).
        if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);

        const onUpdateFound = () => {
          const installing = reg.installing;
          if (!installing) return;
          const onStateChange = () => {
            // `installed` with a controller present means it is waiting its
            // turn; without one it is simply the first install of the app.
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              setWaiting(installing);
              setDismissed(false);
            }
          };
          installing.addEventListener('statechange', onStateChange);
          cleanups.push(() => installing.removeEventListener('statechange', onStateChange));
        };

        reg.addEventListener('updatefound', onUpdateFound);
        cleanups.push(() => reg.removeEventListener('updatefound', onUpdateFound));
      })
      .catch(() => {
        /* no worker registered — nothing to watch */
      });

    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
    };
  }, []);

  if (!waiting || dismissed) return null;

  const reload = () => {
    // Harmless where the worker has no handler for it; where it does, the new
    // version takes over on this reload instead of the next cold start.
    try {
      waiting.postMessage({ type: 'SKIP_WAITING' });
    } catch {
      /* the worker went away between render and tap */
    }
    window.location.reload();
  };

  return (
    <Toast
      message="New version ready."
      action="Reload"
      onAction={reload}
      onDismiss={() => setDismissed(true)}
    />
  );
}
