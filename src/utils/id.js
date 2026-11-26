// The one id generator.
//
// `crypto.randomUUID` only exists in a secure context, which http://localhost
// is and http://192.168.1.x:5173 — the phone-over-LAN path this PWA is
// actually tested on — is not. An unguarded call there throws a TypeError, so
// every call site has to be guarded, which means exactly one of them should
// exist.

let counter = 0;

export function uid() {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  counter += 1;
  return `id-${Date.now().toString(36)}-${counter.toString(36)}-${Math.round(Math.random() * 1e9).toString(36)}`;
}
