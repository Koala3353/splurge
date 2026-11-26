// People and groups, as pure transforms over the stored arrays.
//
// Deleting a person strips their group membership, clears "me" if it was them,
// and drops their outstanding balance — all instantly, with no confirm. The
// answer is an undo rather than a dialog (the same primitive the payment undo
// already proves works), and an undo needs the delete to hand back everything
// it took. That is what `snapshot` is: pass it to the matching restore and the
// roster comes back byte for byte.

/**
 * @param {{people: Array, groups: Array, meId: ?string}} state
 * @param {string} id
 * @returns {{people, groups, meId, snapshot}} snapshot is null if nothing was removed
 */
export function removePersonFrom({ people = [], groups = [], meId = null }, id) {
  const index = people.findIndex((p) => p.id === id);
  if (index === -1) {
    return { people, groups, meId, snapshot: null };
  }

  const memberships = [];
  const nextGroups = groups.map((g) => {
    const at = (g.peopleIds || []).indexOf(id);
    if (at === -1) return g;
    memberships.push({ groupId: g.id, index: at });
    return { ...g, peopleIds: g.peopleIds.filter((pid) => pid !== id) };
  });

  return {
    people: people.filter((p) => p.id !== id),
    groups: nextGroups,
    meId: meId === id ? null : meId,
    snapshot: { person: people[index], index, memberships, wasMe: meId === id },
  };
}

/** Reverses `removePersonFrom`. */
export function restorePersonTo({ people = [], groups = [], meId = null }, snapshot) {
  if (!snapshot?.person) return { people, groups, meId };

  const nextPeople = people.filter((p) => p.id !== snapshot.person.id);
  nextPeople.splice(Math.min(snapshot.index, nextPeople.length), 0, snapshot.person);

  const byGroup = new Map(snapshot.memberships.map((m) => [m.groupId, m.index]));
  const nextGroups = groups.map((g) => {
    if (!byGroup.has(g.id)) return g;
    const ids = (g.peopleIds || []).filter((pid) => pid !== snapshot.person.id);
    ids.splice(Math.min(byGroup.get(g.id), ids.length), 0, snapshot.person.id);
    return { ...g, peopleIds: ids };
  });

  return {
    people: nextPeople,
    groups: nextGroups,
    meId: snapshot.wasMe ? snapshot.person.id : meId,
  };
}

/** @returns {{groups, snapshot}} snapshot is null if nothing was removed */
export function removeGroupFrom(groups = [], id) {
  const index = groups.findIndex((g) => g.id === id);
  if (index === -1) return { groups, snapshot: null };
  return {
    groups: groups.filter((g) => g.id !== id),
    snapshot: { group: groups[index], index },
  };
}

/** Reverses `removeGroupFrom`. */
export function restoreGroupTo(groups = [], snapshot) {
  if (!snapshot?.group) return groups;
  const next = groups.filter((g) => g.id !== snapshot.group.id);
  next.splice(Math.min(snapshot.index, next.length), 0, snapshot.group);
  return next;
}

/**
 * True while the app does not know which of these people is the user.
 *
 * Until it does, the user is invoiced for their own dinner in every outbound
 * message — so this is the flag a "Which one is you?" prompt hangs off.
 */
export function needsSelfIdentity({ people = [], meId = null } = {}) {
  if (people.length === 0) return false;
  return !people.some((p) => p.id === meId);
}
