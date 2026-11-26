// When you last actually chased someone for money.
//
// The app has always written good reminders and then forgotten it sent them,
// which leaves the one question you ask before pressing send — "did I already
// do this?" — answerable only from memory. Double-chasing a friend over a
// dinner is socially expensive in a way that nothing else in this app is, so
// the record is kept and shown at the point the decision is made.
//
// The shape is deliberately the smallest thing that answers the question:
// `{ [personId]: epochMs }`, one entry per person, overwritten each send. No
// history, no per-message log. A list of every reminder ever sent is a
// different product and it would need a deletion story.
//
// Pure, so it tests without a DOM. The store owns the storage key.
import { SETTLED_EPSILON } from './split.js';
import { formatAgo } from './format.js';

/**
 * How long a reminder stays "recent" enough to change what the remind control
 * says. Three days: inside a long weekend it is still the same ask, and past
 * it a second message is a normal thing to send rather than a nag.
 */
export const NUDGE_RECENT_DAYS = 3;

const DAY = 86400000;

/** A stored map, defended against anything a hand-edited backup might hold. */
function clean(map) {
  if (!map || typeof map !== 'object' || Array.isArray(map)) return {};
  const out = {};
  for (const [id, at] of Object.entries(map)) {
    if (typeof id === 'string' && id && Number.isFinite(at) && at > 0) out[id] = at;
  }
  return out;
}

/**
 * Stamp every person a reminder just went out to.
 *
 * A group reminder names several people in one message, so this takes a list
 * and not an id: all of them were nudged, by the same send, at the same time.
 * Returns the previous map unchanged when there is nobody to stamp, so a send
 * that named no one cannot churn storage.
 */
export function recordNudges(prev, ids, now = Date.now()) {
  const list = (Array.isArray(ids) ? ids : [ids]).filter((id) => typeof id === 'string' && id);
  if (list.length === 0) return clean(prev);
  const next = clean(prev);
  for (const id of list) next[id] = now;
  return next;
}

/**
 * Retire markers that have stopped meaning anything.
 *
 * "Reminded 40 days ago" against a friend who has since paid is noise at best
 * and an accusation at worst, so a settled balance drops the marker — as does
 * a person who no longer exists. Credit counts as settled: somebody who has
 * paid ahead is not somebody to chase.
 *
 * Returns the SAME object when nothing changed, so the caller can store it
 * without writing to disk on every balance recalculation.
 */
export function pruneNudges(prev, { people = [], balances = {} } = {}) {
  const current = clean(prev);
  const known = new Set(people.map((p) => p.id));
  let changed = Object.keys(current).length !== Object.keys(prev || {}).length;
  const next = {};
  for (const [id, at] of Object.entries(current)) {
    const owes = (balances[id] || 0) > SETTLED_EPSILON;
    if (known.has(id) && owes) next[id] = at;
    else changed = true;
  }
  return changed ? next : prev;
}

/** Was this person chased recently enough that a second ask is a repeat? */
export function isRecentNudge(at, now = Date.now()) {
  if (!Number.isFinite(at)) return false;
  return now - at < NUDGE_RECENT_DAYS * DAY;
}

/**
 * What the row says. Plain relative language, because the decision is "was it
 * long enough ago" and nobody converts a timestamp to that in their head.
 *
 * Never nudged returns null rather than a zero or a dash: absence is not a
 * number, and a person you have never chased has nothing to report.
 */
export function nudgeNote(at, now = Date.now()) {
  if (!Number.isFinite(at) || at <= 0) return null;
  const ago = formatAgo(at, { now });
  return ago ? `Reminded ${ago}` : null;
}

/**
 * The reminder history inside a backup file.
 *
 * Absent from every backup before version 5, and resolved to "nobody has ever
 * been chased" rather than to a guess: inventing a reminder that never
 * happened would make the app silently talk you out of a message you need to
 * send. Garbage in a hand-edited file resolves the same way, per entry.
 */
export function readBackupNudges(data = {}) {
  return clean(data.nudges);
}
