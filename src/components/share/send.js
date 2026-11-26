/**
 * How a message actually leaves the app.
 *
 * None of this writes the message. shareText.js owns the words; this owns the
 * exit. Two things about that exit are easy to get wrong and both were:
 *
 * 1. `navigator.share()` must be called synchronously inside the handler the
 *    user's tap fired. iOS Safari rejects it with NotAllowedError the moment
 *    an `await` or a `.then()` sits between the gesture and the call, so
 *    `canNativeShare` is deliberately synchronous and the caller invokes
 *    `navigator.share` itself rather than handing it to a helper to await.
 *
 * 2. `navigator.clipboard` is secure-context only. The normal way to test a
 *    PWA on a phone is `http://192.168.x.x:5173`, where it simply does not
 *    exist — so the clipboard path falls back to a selection copy, and
 *    reports honestly when even that fails rather than claiming "Copied".
 */

/**
 * Can the browser hand this text to another app right now?
 * Synchronous on purpose — see the note above.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function canNativeShare(text) {
  if (typeof navigator === 'undefined') return false;
  if (typeof navigator.share !== 'function') return false;
  if (!text) return false;
  // canShare is the one that knows whether this *payload* is shareable.
  // It is absent on some older implementations, where share alone decides.
  if (typeof navigator.canShare === 'function') {
    try {
      return navigator.canShare({ text });
    } catch {
      return false;
    }
  }
  return true;
}

/** The user dismissed the native sheet. Not a failure, and not reportable. */
export function isAbort(error) {
  return error?.name === 'AbortError';
}

/**
 * The pre-Clipboard-API copy. Runs synchronously, so it still works inside
 * the tap that asked for it on an insecure origin.
 */
function selectionCopy(text) {
  if (typeof document === 'undefined') return false;
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  // Off-screen but focusable: `display: none` cannot be selected.
  area.style.position = 'fixed';
  area.style.top = '0';
  area.style.opacity = '0';
  area.style.pointerEvents = 'none';
  document.body.appendChild(area);
  try {
    area.select();
    area.setSelectionRange(0, text.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

/**
 * Put the message on the clipboard, by whichever route this context allows.
 *
 * @param {string} text
 * @returns {Promise<boolean>} true only if the text really landed.
 */
export function copyText(text) {
  if (!text) return Promise.resolve(false);

  const secure = typeof window !== 'undefined' && window.isSecureContext;
  const api = typeof navigator !== 'undefined' ? navigator.clipboard : null;

  if (secure && typeof api?.writeText === 'function') {
    return api.writeText(text).then(
      () => true,
      // Permission denied or the document lost focus: try the old way before
      // telling the user it failed.
      () => selectionCopy(text),
    );
  }

  return Promise.resolve(selectionCopy(text));
}
