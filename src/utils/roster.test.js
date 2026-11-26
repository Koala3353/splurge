import test from 'node:test';
import assert from 'node:assert/strict';

import {
  removePersonFrom,
  restorePersonTo,
  removeGroupFrom,
  restoreGroupTo,
  needsSelfIdentity,
} from './roster.js';

const roster = () => ({
  people: [{ id: 'a', name: 'Ana' }, { id: 'b', name: 'Bea' }, { id: 'c', name: 'Cy' }],
  groups: [
    { id: 'g1', name: 'Barkada', peopleIds: ['a', 'b'] },
    { id: 'g2', name: 'Work', peopleIds: ['c'] },
  ],
  meId: 'b',
});

test('removing a person drops them from the roster and every group', () => {
  const { people, groups } = removePersonFrom(roster(), 'a');
  assert.deepEqual(people.map((p) => p.id), ['b', 'c']);
  assert.deepEqual(groups[0].peopleIds, ['b']);
});

test('removing the person who is "me" clears meId', () => {
  const { meId } = removePersonFrom(roster(), 'b');
  assert.equal(meId, null);
});

test('removing someone else leaves meId alone', () => {
  assert.equal(removePersonFrom(roster(), 'a').meId, 'b');
});

test('an undo of a person delete puts them back exactly where they were', () => {
  const before = roster();
  const { snapshot, ...after } = removePersonFrom(before, 'b');
  const restored = restorePersonTo(after, snapshot);
  assert.deepEqual(restored.people, before.people);
  assert.deepEqual(restored.groups, before.groups);
  assert.equal(restored.meId, 'b');
});

test('undo restores group membership for someone in several groups', () => {
  const before = {
    people: [{ id: 'a', name: 'Ana' }],
    groups: [
      { id: 'g1', name: 'One', peopleIds: ['a'] },
      { id: 'g2', name: 'Two', peopleIds: ['a'] },
    ],
    meId: null,
  };
  const { snapshot, ...after } = removePersonFrom(before, 'a');
  assert.deepEqual(after.groups.map((g) => g.peopleIds), [[], []]);
  assert.deepEqual(restorePersonTo(after, snapshot).groups, before.groups);
});

test('removing an unknown person changes nothing and offers nothing to undo', () => {
  const before = roster();
  const { snapshot, ...after } = removePersonFrom(before, 'nope');
  assert.equal(snapshot, null);
  assert.deepEqual(after.people, before.people);
});

test('restoring a null snapshot is a no-op', () => {
  const before = roster();
  assert.deepEqual(restorePersonTo(before, null), before);
});

test('removePersonFrom does not mutate the roster it was handed', () => {
  const before = roster();
  removePersonFrom(before, 'a');
  assert.deepEqual(before.people.map((p) => p.id), ['a', 'b', 'c']);
  assert.deepEqual(before.groups[0].peopleIds, ['a', 'b']);
});

test('an undo of a group delete puts it back in its old position', () => {
  const before = roster();
  const { groups, snapshot } = removeGroupFrom(before.groups, 'g1');
  assert.deepEqual(groups.map((g) => g.id), ['g2']);
  assert.deepEqual(restoreGroupTo(groups, snapshot), before.groups);
});

test('removing an unknown group changes nothing and offers nothing to undo', () => {
  const before = roster();
  const { groups, snapshot } = removeGroupFrom(before.groups, 'nope');
  assert.equal(snapshot, null);
  assert.deepEqual(groups, before.groups);
});

// --- Finding P1-14: "this is me" is never taught ---

test('needsSelfIdentity is true once there are people but no "me"', () => {
  assert.equal(needsSelfIdentity({ people: [{ id: 'a', name: 'Ana' }], meId: null }), true);
});

test('needsSelfIdentity is false before anyone has been added', () => {
  assert.equal(needsSelfIdentity({ people: [], meId: null }), false);
});

test('needsSelfIdentity is false once someone is marked as me', () => {
  assert.equal(needsSelfIdentity({ people: [{ id: 'a', name: 'Ana' }], meId: 'a' }), false);
});

test('needsSelfIdentity is true again when meId points at a deleted person', () => {
  assert.equal(needsSelfIdentity({ people: [{ id: 'a', name: 'Ana' }], meId: 'gone' }), true);
});
