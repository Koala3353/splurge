import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NUDGE_RECENT_DAYS,
  isRecentNudge,
  nudgeNote,
  pruneNudges,
  readBackupNudges,
  recordNudges,
} from './nudges.js';
import { readBackupExtras } from './suggestions.js';
import { formatAgo } from './format.js';

const DAYS = (n) => n * 86400000;
// A fixed afternoon, so "today" and "yesterday" never straddle midnight
// mid-run: 2026-03-12, 14:00 local.
const NOW = new Date(2026, 2, 12, 14, 0, 0).getTime();

const PEOPLE = [
  { id: 'me', name: 'Me' },
  { id: 'ana', name: 'Ana Dela Peña' },
  { id: 'jm', name: 'Jericho Mangubat' },
  { id: 'kat', name: 'Katrina Villanueva-Reyes' },
];

/* ------------------------------------------------------------ recording */

test('a send stamps every person the message named', () => {
  const out = recordNudges({}, ['ana', 'jm'], NOW);
  assert.deepEqual(out, { ana: NOW, jm: NOW });
});

test('a second reminder overwrites the first — one answer, not a log', () => {
  const first = recordNudges({}, ['ana'], NOW - DAYS(9));
  const second = recordNudges(first, ['ana'], NOW);
  assert.equal(second.ana, NOW);
  assert.equal(Object.keys(second).length, 1);
});

test('stamping one person leaves the others where they were', () => {
  const prev = { ana: NOW - DAYS(9), jm: NOW - DAYS(2) };
  const out = recordNudges(prev, ['ana'], NOW);
  assert.equal(out.jm, NOW - DAYS(2));
});

test('a send that named nobody writes nothing', () => {
  const prev = { ana: NOW - DAYS(9) };
  assert.deepEqual(recordNudges(prev, [], NOW), prev);
  assert.deepEqual(recordNudges(prev, null, NOW), prev);
});

/* -------------------------------------------------------------- retiring */

test('settling a debt retires the marker', () => {
  const prev = { ana: NOW - DAYS(40), jm: NOW - DAYS(1) };
  const out = pruneNudges(prev, {
    people: PEOPLE,
    // Ana has paid up; Jericho still owes a messy 1411.58.
    balances: { ana: 0, jm: 1411.58 },
  });
  assert.deepEqual(out, { jm: NOW - DAYS(1) });
});

test('a balance under the settled epsilon retires it too', () => {
  const out = pruneNudges({ ana: NOW }, {
    people: PEOPLE,
    balances: { ana: 0.004 },
  });
  assert.deepEqual(out, {});
});

test('paying ahead is not somebody to chase', () => {
  const out = pruneNudges({ kat: NOW }, {
    people: PEOPLE,
    balances: { kat: -250.75 },
  });
  assert.deepEqual(out, {});
});

test('a deleted person takes their marker with them', () => {
  const out = pruneNudges({ ghost: NOW }, {
    people: PEOPLE,
    balances: { ghost: 980.25 },
  });
  assert.deepEqual(out, {});
});

test('pruning hands back the same object when nothing changed', () => {
  const prev = { jm: NOW - DAYS(3) };
  const out = pruneNudges(prev, { people: PEOPLE, balances: { jm: 1411.58 } });
  assert.equal(out, prev, 'identity is the signal that nothing needs writing');
});

/* ------------------------------------------------------------- the words */

test('a person never chased shows nothing at all', () => {
  assert.equal(nudgeNote(undefined, NOW), null);
  assert.equal(nudgeNote(0, NOW), null);
  assert.equal(nudgeNote('yesterday', NOW), null);
});

test('the marker reads as a sentence, not a timestamp', () => {
  assert.equal(nudgeNote(NOW, NOW), 'Reminded today');
  assert.equal(nudgeNote(NOW - DAYS(1), NOW), 'Reminded yesterday');
  assert.equal(nudgeNote(NOW - DAYS(9), NOW), 'Reminded 9 days ago');
});

test('a reminder old enough to stop being a day count gets a date', () => {
  const note = nudgeNote(NOW - DAYS(45), NOW);
  assert.match(note, /^Reminded on /);
  assert.doesNotMatch(note, /days ago/);
});

test('late last night still reads as yesterday, not as hours', () => {
  const lastNight = new Date(2026, 2, 11, 23, 30, 0).getTime();
  assert.equal(formatAgo(lastNight, { now: NOW }), 'yesterday');
});

test('recency is a three-day window, and nothing is ever blocked by it', () => {
  assert.equal(NUDGE_RECENT_DAYS, 3);
  assert.equal(isRecentNudge(NOW - DAYS(1), NOW), true);
  assert.equal(isRecentNudge(NOW - DAYS(4), NOW), false);
  assert.equal(isRecentNudge(undefined, NOW), false);
});

/* ------------------------------------------------------- backup / restore */

test('a version-5 backup round-trips the reminder history intact', () => {
  const written = {
    version: 5,
    people: PEOPLE,
    nudges: { ana: NOW - DAYS(9), jm: NOW - DAYS(1) },
  };
  const out = readBackupExtras(JSON.parse(JSON.stringify(written)));
  assert.deepEqual(out.nudges, { ana: NOW - DAYS(9), jm: NOW - DAYS(1) });
  // And what comes back still says the same thing it said before the export.
  assert.equal(nudgeNote(out.nudges.ana, NOW), 'Reminded 9 days ago');
});

test('a version-4 backup restores with no reminder history, never an invented one', () => {
  const v4 = { version: 4, people: PEOPLE, templates: [], usual: null, lastTipPct: 10 };
  const out = readBackupExtras(v4);
  assert.deepEqual(out.nudges, {});
  // The rest of the chain is untouched by the new field.
  assert.equal(out.lastTipPct, 10);
  assert.equal(out.usual, null);
});

test('a version-1 backup with no nudges key at all restores cleanly', () => {
  assert.deepEqual(readBackupExtras({ version: 1, people: PEOPLE }).nudges, {});
  assert.deepEqual(readBackupNudges({}), {});
});

test('a damaged backup cannot poison the reminder history', () => {
  assert.deepEqual(readBackupNudges({ nudges: 'not an object' }), {});
  assert.deepEqual(readBackupNudges({ nudges: ['ana'] }), {});
  assert.deepEqual(
    readBackupNudges({ nudges: { ana: 'yesterday', jm: -1, kat: NOW } }),
    { kat: NOW },
  );
});
