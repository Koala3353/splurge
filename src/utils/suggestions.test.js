import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSuggestions, dueTemplates, nextDueAt, rankPeopleBySplits,
  readBackupExtras, resolveUsual,
} from './suggestions.js';

const PEOPLE = [{ id: 'me' }, { id: 'mika' }, { id: 'raf' }];
const CREW = [{ id: 'me' }, { id: 'mika' }, { id: 'raf' }, { id: 'bea' }];
// A Thursday evening, so "weekday-evening" is the current slot.
const NOW = new Date('2026-10-29T20:00:00').getTime();
const DAY = 86400000;

const bill = (title, people, price, date) => ({
  id: `${title}-${date}`,
  title,
  date: new Date(date).toISOString(),
  participants: people,
  items: [{ id: 'i', name: title, price, people }],
  fees: [],
});

// An itemised bill: several lines, each on a subset of the table.
const itemised = (title, people, lines, date, extra = {}) => ({
  id: `${title}-${date}`,
  title,
  date: new Date(date).toISOString(),
  participants: people,
  items: lines.map(([name, price, on], i) => ({
    id: `i${i}`, name, price, people: on,
  })),
  fees: [],
  ...extra,
});

const run = (over = {}) =>
  buildSuggestions({ people: PEOPLE, meId: 'me', now: NOW, ...over });

test('a split made once is not yet a habit', () => {
  const out = run({ bills: [bill('Ramen', ['me', 'mika'], 700, '2026-10-20T19:00:00')] });
  assert.equal(out.length, 0);
});

test('a repeated split is suggested, at its typical amount', () => {
  const out = run({
    bills: [
      bill('Date night', ['me', 'mika'], 1200, '2026-10-01T20:00:00'),
      bill('Date night', ['me', 'mika'], 1600, '2026-10-15T20:00:00'),
      bill('Date night', ['me', 'mika'], 1400, '2026-10-22T20:00:00'),
    ],
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].title, 'Date night');
  assert.equal(out[0].amount, 1400); // median, not mean — one blowout can't skew it
  assert.deepEqual(out[0].people.sort(), ['me', 'mika']);
});

test('the same name with different people is a different split', () => {
  const out = run({
    bills: [
      bill('Dinner', ['me', 'mika'], 800, '2026-10-10T20:00:00'),
      bill('Dinner', ['me', 'mika'], 900, '2026-10-17T20:00:00'),
      bill('Dinner', ['me', 'raf'], 500, '2026-10-11T20:00:00'),
      bill('Dinner', ['me', 'raf'], 600, '2026-10-18T20:00:00'),
    ],
  });
  assert.equal(out.length, 2);
  assert.notEqual(out[0].people.join(), out[1].people.join());
});

test('punctuation and case do not split one habit into two', () => {
  const out = run({
    bills: [
      bill('Date Night!', ['me', 'mika'], 1000, '2026-10-08T20:00:00'),
      bill('date night', ['me', 'mika'], 1000, '2026-10-15T20:00:00'),
    ],
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].count, 2);
  // The most recent spelling is the one shown back to you.
  assert.equal(out[0].title, 'date night');
});

test('a habit that matches right now outranks one that is merely more recent', () => {
  const out = run({
    bills: [
      // Thursday evenings — the current slot.
      bill('Date night', ['me', 'mika'], 1200, '2026-10-01T20:00:00'),
      bill('Date night', ['me', 'mika'], 1200, '2026-10-08T20:00:00'),
      bill('Date night', ['me', 'mika'], 1200, '2026-10-15T20:00:00'),
      // Weekday mornings, and more recent.
      bill('Coffee', ['me', 'raf'], 200, '2026-10-26T09:00:00'),
      bill('Coffee', ['me', 'raf'], 200, '2026-10-27T09:00:00'),
      bill('Coffee', ['me', 'raf'], 200, '2026-10-28T09:00:00'),
    ],
  });
  assert.equal(out[0].title, 'Date night');
  assert.equal(out[0].kind, 'time');
  assert.match(out[0].reason, /weekday evenings/);
  assert.equal(out[1].title, 'Coffee');
});

test('a saved template outranks anything inferred', () => {
  const out = run({
    bills: [
      bill('Groceries', ['me', 'raf'], 2000, '2026-10-20T18:00:00'),
      bill('Groceries', ['me', 'raf'], 2000, '2026-10-27T18:00:00'),
    ],
    templates: [{ id: 't1', title: 'Rent', people: ['me', 'mika'], amount: 15000 }],
  });
  assert.equal(out[0].kind, 'template');
  assert.equal(out[0].title, 'Rent');
});

test('a template hides the history entry it duplicates', () => {
  const out = run({
    bills: [
      bill('Date night', ['me', 'mika'], 1200, '2026-10-08T20:00:00'),
      bill('Date night', ['me', 'mika'], 1200, '2026-10-15T20:00:00'),
    ],
    templates: [{ id: 't1', title: 'Date night', people: ['me', 'mika'], amount: 1300 }],
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, 'template');
  assert.equal(out[0].amount, 1300);
});

test('splits with nobody but you are not offered back', () => {
  const out = run({
    bills: [
      bill('Lunch', ['me'], 300, '2026-10-10T12:00:00'),
      bill('Lunch', ['me'], 300, '2026-10-17T12:00:00'),
    ],
  });
  assert.equal(out.length, 0);
});

test('a deleted person takes their suggestions with them', () => {
  const out = buildSuggestions({
    people: [{ id: 'me' }], // mika has been removed
    meId: 'me',
    now: NOW,
    bills: [
      bill('Date night', ['me', 'mika'], 1200, '2026-10-08T20:00:00'),
      bill('Date night', ['me', 'mika'], 1200, '2026-10-15T20:00:00'),
    ],
    templates: [{ id: 't1', title: 'Rent', people: ['mika'], amount: 15000 }],
  });
  assert.equal(out.length, 0);
});

test('a bill dated in the future cannot become a habit', () => {
  const out = run({
    bills: [
      bill('Trip', ['me', 'mika'], 5000, '2026-11-20T10:00:00'),
      bill('Trip', ['me', 'mika'], 5000, '2026-12-20T10:00:00'),
    ],
  });
  assert.equal(out.length, 0);
});

test('an old habit ranks below a current one', () => {
  const out = run({
    bills: [
      bill('Old thing', ['me', 'mika'], 100, new Date(NOW - 200 * DAY).toISOString()),
      bill('Old thing', ['me', 'mika'], 100, new Date(NOW - 190 * DAY).toISOString()),
      bill('New thing', ['me', 'raf'], 100, new Date(NOW - 10 * DAY).toISOString()),
      bill('New thing', ['me', 'raf'], 100, new Date(NOW - 3 * DAY).toISOString()),
    ],
  });
  assert.equal(out[0].title, 'New thing');
});

test('the list is capped', () => {
  const bills = [];
  for (let i = 0; i < 12; i++) {
    bills.push(bill(`Thing ${i}`, ['me', 'mika'], 100, `2026-10-0${(i % 9) + 1}T20:00:00`));
    bills.push(bill(`Thing ${i}`, ['me', 'mika'], 100, `2026-10-1${i % 9}T20:00:00`));
  }
  assert.equal(run({ bills, limit: 4 }).length, 4);
});

test('an itemised source is flagged itemised and names the bill to repeat', () => {
  const recent = itemised(
    'Sinangag sa Kanto',
    ['me', 'mika', 'raf'],
    [
      ['Sisig', 345.5, ['me', 'raf']],
      ['Garlic rice', 87.25, ['me', 'mika', 'raf']],
      ['Halo-halo', 164.75, ['mika']],
    ],
    '2026-10-22T20:00:00',
  );
  const out = run({
    bills: [
      itemised(
        'Sinangag sa Kanto',
        ['me', 'mika', 'raf'],
        [
          ['Sisig', 320, ['me', 'raf']],
          ['Garlic rice', 82, ['me', 'mika', 'raf']],
        ],
        '2026-10-08T20:00:00',
      ),
      recent,
    ],
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].itemised, true);
  assert.equal(out[0].sourceBillId, recent.id);
  assert.equal(out[0].lines, 3);
});

test('a single-amount source still quick-splits', () => {
  const out = run({
    bills: [
      bill('Grab to Poblacion', ['me', 'mika'], 287.4, '2026-10-12T21:00:00'),
      bill('Grab to Poblacion', ['me', 'mika'], 311.75, '2026-10-19T21:00:00'),
    ],
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].itemised, false);
  assert.equal(out[0].lines, 0);
});

test('a saved template is never the itemised kind', () => {
  const out = run({
    templates: [{ id: 't1', title: 'Upa', people: ['me', 'mika'], amount: 18750 }],
  });
  assert.equal(out[0].itemised, false);
  assert.equal(out[0].sourceBillId, null);
});

test('the most recent matching bill is the one repeated', () => {
  const older = itemised(
    'Lunch sa Jollibee',
    ['me', 'raf'],
    [['Chickenjoy', 232.5, ['me']], ['Jolly spaghetti', 118.75, ['raf']]],
    '2026-10-11T12:00:00',
  );
  const newest = bill('Lunch sa Jollibee', ['me', 'raf'], 402.25, '2026-10-25T12:00:00');
  const out = run({ bills: [newest, older] });
  assert.equal(out[0].sourceBillId, newest.id);
  // The newest trip was one amount, so the chip offers a quick split — the
  // kind follows the bill that would actually be repeated.
  assert.equal(out[0].itemised, false);
});

test('a source bill naming a deleted person still gives a usable suggestion', () => {
  const out = buildSuggestions({
    people: PEOPLE, // bea has been removed since
    meId: 'me',
    now: NOW,
    bills: [
      itemised(
        'Inasal sa Bacolod',
        ['me', 'mika', 'raf', 'bea'],
        [['Pecho', 289.5, ['me', 'bea']], ['Chicken oil rice', 96.25, ['mika', 'raf']]],
        '2026-10-09T19:00:00',
      ),
      itemised(
        'Inasal sa Bacolod',
        ['me', 'mika', 'raf', 'bea'],
        [['Pecho', 299, ['me', 'bea']], ['Chicken oil rice', 102.5, ['mika', 'raf']]],
        '2026-10-23T19:00:00',
      ),
    ],
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].itemised, true);
  assert.ok(out[0].sourceBillId);
  // The deleted person is gone from the crew the repeat will open with; the
  // wizard scrubs their lines from there.
  assert.deepEqual([...out[0].people].sort(), ['me', 'mika', 'raf']);
});

test('the crew is matched on the people who are still around', () => {
  const out = buildSuggestions({
    people: CREW,
    meId: 'me',
    now: NOW,
    bills: [
      itemised('Inuman', ['me', 'mika', 'bea'], [['Red Horse', 412.75, ['me', 'bea']], ['Sisig', 268, ['mika']]], '2026-10-10T21:00:00'),
      itemised('Inuman', ['me', 'mika', 'bea'], [['Red Horse', 398.5, ['me', 'bea']], ['Sisig', 275, ['mika']]], '2026-10-24T21:00:00'),
    ],
  });
  assert.equal(out.length, 1);
  assert.deepEqual([...out[0].people].sort(), ['bea', 'me', 'mika']);
});

/* ------------------------------------------------------------------ *
 * Cadence and the due prompt
 * ------------------------------------------------------------------ */

const DAYS = (n) => n * DAY;

const tpl = (over = {}) => ({
  id: 't1',
  title: 'Upa kay Ate Marivic',
  people: ['me', 'mika'],
  amount: 18750,
  cadence: 'monthly',
  createdAt: null,
  snoozedUntil: null,
  lastUsed: null,
  ...over,
});

test('a template with no cadence is never due', () => {
  assert.equal(nextDueAt(tpl({ cadence: 'none', lastUsed: NOW - DAYS(400) })), null);
  assert.deepEqual(
    dueTemplates({ templates: [tpl({ cadence: 'none', lastUsed: NOW - DAYS(400) })], people: PEOPLE, now: NOW }),
    [],
  );
});

test('a template restored from an older backup, with no cadence field, is never due', () => {
  const legacy = { id: 't0', title: 'Grab', people: ['me', 'raf'], amount: 287.4, lastUsed: NOW - DAYS(90) };
  assert.equal(nextDueAt(legacy), null);
  assert.deepEqual(dueTemplates({ templates: [legacy], people: PEOPLE, now: NOW }), []);
});

test('weekly falls due seven days after the split was last made', () => {
  const t = tpl({ cadence: 'weekly', lastUsed: NOW - DAYS(7) });
  assert.equal(nextDueAt(t), NOW - DAYS(7) + DAYS(7));
  assert.equal(dueTemplates({ templates: [t], people: PEOPLE, now: NOW }).length, 1);
  assert.equal(
    dueTemplates({ templates: [tpl({ cadence: 'weekly', lastUsed: NOW - DAYS(6) })], people: PEOPLE, now: NOW }).length,
    0,
  );
});

test('fortnightly is two weeks, not two months', () => {
  const t = tpl({ cadence: 'fortnightly', lastUsed: NOW - DAYS(14) });
  assert.equal(nextDueAt(t), NOW);
  assert.equal(dueTemplates({ templates: [t], people: PEOPLE, now: NOW }).length, 1);
});

test('monthly keeps the day of the month rather than adding thirty days', () => {
  const jan15 = new Date('2026-01-15T09:00:00').getTime();
  assert.equal(
    new Date(nextDueAt(tpl({ lastUsed: jan15 }))).getDate(),
    15,
  );
});

test('a monthly split anchored on the 31st lands on the last day of a short month', () => {
  const jan31 = new Date('2026-01-31T09:00:00').getTime();
  const next = new Date(nextDueAt(tpl({ lastUsed: jan31 })));
  assert.equal(next.getMonth(), 1); // February, not March
  assert.equal(next.getDate(), 28);
});

test('the clock runs from the last split, so a late one moves the next one', () => {
  // Due on the 1st, actually made on the 4th: the next one is the 4th.
  const madeLate = new Date('2026-03-04T09:00:00').getTime();
  const next = new Date(nextDueAt(tpl({ lastUsed: madeLate })));
  assert.equal(next.getDate(), 4);
});

test('a template never yet used falls due a cycle after it was set up', () => {
  const t = tpl({ cadence: 'weekly', lastUsed: null, createdAt: NOW - DAYS(8) });
  assert.equal(dueTemplates({ templates: [t], people: PEOPLE, now: NOW }).length, 1);
  // Set up yesterday, so not yet.
  const fresh = tpl({ cadence: 'weekly', lastUsed: null, createdAt: NOW - DAYS(1) });
  assert.equal(dueTemplates({ templates: [fresh], people: PEOPLE, now: NOW }).length, 0);
});

test('a template with no anchor at all cannot be due', () => {
  assert.equal(nextDueAt(tpl({ cadence: 'weekly', lastUsed: null, createdAt: null })), null);
});

test('a snooze hides the prompt until it lapses', () => {
  const base = tpl({ cadence: 'weekly', lastUsed: NOW - DAYS(10) });
  assert.equal(
    dueTemplates({ templates: [{ ...base, snoozedUntil: NOW + DAYS(1) }], people: PEOPLE, now: NOW }).length,
    0,
  );
  assert.equal(
    dueTemplates({ templates: [{ ...base, snoozedUntil: NOW - 1 }], people: PEOPLE, now: NOW }).length,
    1,
  );
});

test('a due prompt names the crew who are still around, and drops one with nobody left', () => {
  const out = dueTemplates({
    templates: [tpl({ cadence: 'weekly', lastUsed: NOW - DAYS(10), people: ['me', 'mika', 'bea'] })],
    people: PEOPLE,
    now: NOW,
  });
  assert.deepEqual(out[0].people, ['me', 'mika']);
  assert.equal(
    dueTemplates({
      templates: [tpl({ cadence: 'weekly', lastUsed: NOW - DAYS(10), people: ['bea'] })],
      people: PEOPLE,
      now: NOW,
    }).length,
    0,
  );
});

test('the most overdue split is prompted first, and says how late it is', () => {
  const out = dueTemplates({
    templates: [
      tpl({ id: 'a', title: 'Groceries', cadence: 'weekly', lastUsed: NOW - DAYS(8) }),
      tpl({ id: 'b', title: 'Upa', cadence: 'weekly', lastUsed: NOW - DAYS(20) }),
    ],
    people: PEOPLE,
    now: NOW,
  });
  assert.deepEqual(out.map((d) => d.title), ['Upa', 'Groceries']);
  assert.match(out[0].reason, /Every week/);
  assert.match(out[0].reason, /due last week|due 13 days ago|due 2 weeks ago/);
  assert.match(
    dueTemplates({ templates: [tpl({ cadence: 'weekly', lastUsed: NOW - DAYS(7) })], people: PEOPLE, now: NOW })[0].reason,
    /due today/,
  );
});

test('a split that has come round is prompted, not also listed in the suggestions row', () => {
  const due = tpl({ cadence: 'weekly', lastUsed: NOW - DAYS(10) });
  assert.equal(dueTemplates({ templates: [due], people: PEOPLE, now: NOW }).length, 1);
  assert.equal(run({ templates: [due] }).length, 0);
  // Not yet due, so the row still carries it as an ordinary saved split.
  const notYet = tpl({ cadence: 'weekly', lastUsed: NOW - DAYS(2) });
  assert.equal(run({ templates: [notYet] })[0].kind, 'template');
});

/* ------------------------------------------------------------------ *
 * The picker's order
 * ------------------------------------------------------------------ */

const NAMED = [
  { id: 'me', name: 'Me' },
  { id: 'mika', name: 'Mika Pascual' },
  { id: 'raf', name: 'Rafael Dizon' },
  { id: 'bea', name: 'Beatriz Lacson' },
];

test('the picker leads with the people you actually split with', () => {
  const out = rankPeopleBySplits({
    people: NAMED,
    bills: [
      bill('Date night', ['me', 'mika'], 1200, '2026-10-01T20:00:00'),
      bill('Date night', ['me', 'mika'], 1340, '2026-10-08T20:00:00'),
      bill('Date night', ['me', 'mika'], 1275, '2026-10-15T20:00:00'),
      bill('Inuman', ['me', 'raf'], 870.25, '2026-10-18T21:00:00'),
    ],
  });
  assert.deepEqual(out.map((p) => p.id), ['me', 'mika', 'raf', 'bea']);
});

test('a tie falls back to the name, so the order never jitters between visits', () => {
  const bills = [bill('Lunch', ['mika', 'raf'], 480, '2026-10-18T12:00:00')];
  const first = rankPeopleBySplits({ people: NAMED, bills });
  const again = rankPeopleBySplits({ people: [...NAMED].reverse(), bills });
  assert.deepEqual(first.map((p) => p.id), again.map((p) => p.id));
  // Mika and Rafael both have one; "Mika Pascual" sorts before "Rafael Dizon".
  assert.deepEqual(first.map((p) => p.id), ['mika', 'raf', 'bea', 'me']);
});

test('being named twice on one bill still counts as one split', () => {
  const out = rankPeopleBySplits({
    people: NAMED,
    bills: [{ id: 'x', participants: ['mika', 'mika', 'mika'] }, bill('A', ['raf', 'bea'], 100, '2026-10-01T12:00:00')],
  });
  assert.equal(out[0].id, 'bea'); // one each, alphabetical
});

test('ranking survives bills with no participants at all', () => {
  assert.doesNotThrow(() => rankPeopleBySplits({ people: NAMED, bills: [{ id: 'z' }] }));
  assert.equal(rankPeopleBySplits({}).length, 0);
});

/* ------------------------------------------------------------------ *
 * The usual crew, and reading it all back out of a backup
 * ------------------------------------------------------------------ */

const GROUPS = [{ id: 'g1', name: 'Bahay', peopleIds: ['me', 'mika', 'bea'] }];

test('no usual crew set means a split opens with nobody on it', () => {
  assert.deepEqual(resolveUsual({ usual: null, people: NAMED, groups: GROUPS }).ids, []);
  assert.deepEqual(resolveUsual({}).ids, []);
});

test('a usual person resolves to themselves, named for the banner', () => {
  const out = resolveUsual({ usual: { kind: 'person', id: 'mika' }, people: NAMED, groups: GROUPS });
  assert.deepEqual(out.ids, ['mika']);
  assert.equal(out.label, 'Mika Pascual');
  assert.equal(out.kind, 'person');
});

test('a usual crew follows the group, so adding a flatmate carries through', () => {
  const out = resolveUsual({
    usual: { kind: 'group', id: 'g1' },
    people: NAMED,
    groups: [{ id: 'g1', name: 'Bahay', peopleIds: ['me', 'mika', 'bea', 'raf'] }],
  });
  assert.deepEqual(out.ids.sort(), ['bea', 'me', 'mika', 'raf']);
  assert.equal(out.label, 'Bahay');
});

test('a usual person deleted since resolves to nobody, never to the wrong person', () => {
  assert.deepEqual(
    resolveUsual({ usual: { kind: 'person', id: 'gone' }, people: NAMED, groups: GROUPS }).ids,
    [],
  );
  assert.deepEqual(
    resolveUsual({ usual: { kind: 'group', id: 'gone' }, people: NAMED, groups: GROUPS }).ids,
    [],
  );
});

test('a usual crew whose every member is gone resolves to nobody', () => {
  assert.deepEqual(
    resolveUsual({
      usual: { kind: 'group', id: 'g1' },
      people: [{ id: 'raf', name: 'Rafael Dizon' }],
      groups: GROUPS,
    }).ids,
    [],
  );
});

test('a usual crew keeps the members who are still around', () => {
  const out = resolveUsual({
    usual: { kind: 'group', id: 'g1' },
    people: [{ id: 'me', name: 'Me' }, { id: 'mika', name: 'Mika Pascual' }],
    groups: GROUPS,
  });
  assert.deepEqual(out.ids, ['me', 'mika']);
});

test('a version-3 backup restores with no cadences, no usual crew and no remembered tip', () => {
  const v3 = {
    version: 3,
    people: NAMED,
    templates: [{ id: 't1', title: 'Upa', people: ['me', 'mika'], amount: 18750, lastUsed: NOW - DAYS(400) }],
  };
  const out = readBackupExtras(v3);
  assert.equal(out.usual, null);
  assert.equal(out.lastTipPct, 0);
  assert.equal(out.templates[0].cadence, 'none');
  assert.equal(out.templates[0].createdAt, null);
  assert.equal(out.templates[0].snoozedUntil, null);
  // Four hundred days stale and still not a prompt: a restore cannot invent
  // a reminder nobody asked for.
  assert.deepEqual(dueTemplates({ templates: out.templates, people: PEOPLE, now: NOW }), []);
});

test('a version-1 backup with no templates key at all restores cleanly', () => {
  const out = readBackupExtras({ version: 1, people: NAMED });
  assert.deepEqual(out.templates, []);
  assert.equal(out.usual, null);
  assert.equal(out.lastTipPct, 0);
});

test('a version-4 backup round-trips the new fields intact', () => {
  const written = {
    version: 4,
    templates: [tpl({ cadence: 'monthly', lastUsed: NOW - DAYS(40), snoozedUntil: NOW + DAYS(1) })],
    usual: { kind: 'person', id: 'mika' },
    lastTipPct: 12.5,
  };
  const out = readBackupExtras(JSON.parse(JSON.stringify(written)));
  assert.deepEqual(out.usual, { kind: 'person', id: 'mika' });
  assert.equal(out.lastTipPct, 12.5);
  assert.equal(out.templates[0].cadence, 'monthly');
  assert.equal(out.templates[0].lastUsed, NOW - DAYS(40));
  // The snooze came back with it, so a restore does not re-raise a prompt
  // the user had already waved away.
  assert.deepEqual(dueTemplates({ templates: out.templates, people: PEOPLE, now: NOW }), []);
});

test('a damaged backup cannot poison the new fields', () => {
  const out = readBackupExtras({
    templates: 'not an array',
    usual: ['nope'],
    lastTipPct: 'twelve',
  });
  assert.deepEqual(out.templates, []);
  assert.equal(out.usual, null);
  assert.equal(out.lastTipPct, 0);
  assert.equal(readBackupExtras({ usual: 'mika' }).usual, null);
});
