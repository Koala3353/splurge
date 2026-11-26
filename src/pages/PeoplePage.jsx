import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../store/AppContext';
import { isSettled } from '../utils/split';
import { formatCurrency } from '../utils/format';
import { nudgeNote } from '../utils/nudges';
import { useUndoableAction } from '../hooks/useUndoableAction';
import { useSettleLanding } from '../hooks/useSettleLanding';
import Button from '../components/ui/Button.jsx';
import Field from '../components/ui/Field.jsx';
import Row from '../components/ui/Row.jsx';
import Sheet from '../components/ui/Sheet.jsx';
import Stamp from '../components/ui/Stamp.jsx';
import SwipeableItem from '../components/SwipeableItem';
import ShareSheet from '../components/ShareSheet';
import PersonDetail from '../components/people/PersonDetail.jsx';
import GroupCard from '../components/people/GroupCard.jsx';
import NewGroupForm from '../components/people/NewGroupForm.jsx';
import UndoToast from '../components/people/UndoToast.jsx';
// TODO: swap for the shared SearchField once it exists (see the file header).
import SearchField from '../components/SearchField.jsx';

const TABS = [
  { id: 'friends', label: 'Friends' },
  { id: 'groups', label: 'Groups' },
];

const tabStyle = (active) => ({
  flex: 1,
  minHeight: 'var(--control-min)',
  border: 0,
  borderBottom: `var(--stamp-border-width) solid ${active ? 'var(--ink)' : 'var(--rule)'}`,
  background: 'transparent',
  color: active ? 'var(--ink)' : 'var(--ink-2)',
  fontWeight: active ? 'var(--weight-medium)' : 'var(--weight-regular)',
});

/** One friend's line: name, what they owe, and the stamp when it closes. */
function FriendRow({ person, balance, reminded, onOpen }) {
  // Paying more than you owed is not a debt: a negative balance is credit
  // sitting against their next split, and it closes the row either way.
  const clear = isSettled(balance) || balance < 0;
  const ahead = balance < 0 && !isSettled(balance);
  const landing = useSettleLanding(clear, person.id);

  // A settled friend has no marker to show — it is retired the moment the
  // balance closes — so the two notes can never contend for the line.
  return (
    <Row
      name={person.name}
      note={ahead ? `Paid ${formatCurrency(-balance)} ahead` : reminded || undefined}
      figure={formatCurrency(balance > 0 ? balance : 0)}
      state={clear ? 'settled' : 'owed'}
      trailing={clear ? <Stamp status="settled" land={landing} /> : null}
      onClick={onOpen}
    />
  );
}

export default function PeoplePage() {
  const navigate = useNavigate();
  const {
    people,
    addPerson,
    removePerson,
    restorePerson,
    groups,
    removeGroup,
    restoreGroup,
    meId,
    balances,
    buildGroupReminderText,
    buildShareText,
    nudges,
    recordNudge,
  } = useAppContext();

  const [activeTab, setActiveTab] = useState('friends');
  const [search, setSearch] = useState('');
  const [detailPersonId, setDetailPersonId] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [draftNames, setDraftNames] = useState('');
  // Named in this sitting, so the sheet can show what it just took in.
  const [justAdded, setJustAdded] = useState([]);
  // Which slice of people the reminder covers: { peopleIds, label } or {}.
  const [remindScope, setRemindScope] = useState(null);

  const undoable = useUndoableAction();

  const me = meId ? people.find((p) => p.id === meId) : null;

  // Everyone except you, sorted: still-owing first (by balance desc), settled last.
  const friends = useMemo(() => {
    const list = people.filter((p) => p.id !== meId);
    return list.sort((a, b) => {
      const balA = balances[a.id] || 0;
      const balB = balances[b.id] || 0;
      const owesA = !isSettled(balA) && balA > 0;
      const owesB = !isSettled(balB) && balB > 0;
      if (owesA !== owesB) return owesA ? -1 : 1;
      if (owesA && owesB) return balB - balA;
      return a.name.localeCompare(b.name);
    });
  }, [people, meId, balances]);

  const owes = useCallback(
    (id) => (balances[id] || 0) > 0 && !isSettled(balances[id] || 0),
    [balances],
  );

  const owingCount = useMemo(
    () => friends.filter((p) => owes(p.id)).length,
    [friends, owes],
  );

  const visibleFriends = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter((p) => p.name.toLowerCase().includes(q));
  }, [friends, search]);

  const buildReminderBody = useCallback(
    (options) => buildGroupReminderText(remindScope || {}, options),
    [buildGroupReminderText, remindScope],
  );

  // Who the reminder can be aimed at, chosen inside the share sheet rather
  // than in a chooser dialog in front of it: that dialog made the message
  // three modals deep for something that is one decision.
  const remindScopes = useMemo(() => ([
    { id: '', label: 'Everyone who owes you', count: owingCount, peopleIds: null },
    ...groups.map((g) => ({
      id: g.id,
      label: g.name,
      count: g.peopleIds.filter((id) => owes(id)).length,
      peopleIds: g.peopleIds,
    })),
  ]), [groups, owingCount, owes]);

  // The same reminder, split per person. A group blob gets forwarded once and
  // then ignored; a message addressed to one friend, with only their share in
  // it, is the one that gets paid — which is how a GCash collection actually
  // runs. Sent from the row's own tap inside the share sheet.
  const remindRecipients = useMemo(() => {
    const inScope = remindScope?.peopleIds
      ? friends.filter((p) => remindScope.peopleIds.includes(p.id))
      : friends;
    return inScope
      .filter((p) => owes(p.id))
      .map((p) => ({
        id: p.id,
        name: p.name,
        note: nudgeNote(nudges?.[p.id]) || undefined,
        figure: formatCurrency(balances[p.id] || 0),
        buildText: (options) => buildShareText(p.id, options),
      }));
  }, [friends, remindScope, owes, balances, buildShareText, nudges]);

  // A group reminder names everybody in scope who still owes, so sending it
  // chases all of them at once and all of them are stamped. The list is the
  // same one the per-person rows are built from, which is what keeps "who the
  // message named" and "who got marked" from drifting apart.
  const remindIds = useMemo(
    () => remindRecipients.map((p) => p.id),
    [remindRecipients],
  );

  // Adding people is nearly always several at once — you add a group chat's
  // worth of friends, not one. The sheet takes a whole pasted list.
  const addNames = (e) => {
    e.preventDefault();
    const names = draftNames
      .split(/[,;\n]+/)
      .map((n) => n.trim())
      .filter(Boolean);
    if (names.length === 0) return;

    const existing = new Set(people.map((p) => p.name.toLowerCase()));
    const added = [];
    for (const name of names) {
      const key = name.toLowerCase();
      if (existing.has(key)) continue; // the same list pasted twice shouldn't duplicate
      existing.add(key);
      addPerson(name);
      added.push(name);
    }
    setJustAdded((prev) => [...added, ...prev].slice(0, 12));
    setDraftNames('');
  };

  // Both deletions take a balance history with them, so both go through the
  // undo window. A confirm dialog in front of every swipe would tax the
  // common case to guard the rare one; this taxes nothing.
  const removeFriend = (person) => {
    undoable.run({
      label: `Removed ${person.name}`,
      act: () => removePerson(person.id),
      undo: (snapshot) => restorePerson(snapshot),
    });
    if (detailPersonId === person.id) setDetailPersonId(null);
  };

  const dropGroup = (group) => {
    undoable.run({
      label: `Removed ${group.name}`,
      act: () => removeGroup(group.id),
      undo: (snapshot) => restoreGroup(snapshot),
    });
  };

  return (
    <>
      <main className="app__main">
        <div className="column u-stack-loose">
          <header className="u-between">
            <h1>People</h1>
            {me ? <span className="u-micro u-ink-2">You: {me.name}</span> : null}
          </header>

          <div role="tablist" aria-label="People and groups" style={{ display: 'flex' }}>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`tab-${tab.id}`}
                aria-selected={activeTab === tab.id}
                aria-controls={`panel-${tab.id}`}
                style={tabStyle(activeTab === tab.id)}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'friends' ? (
            <section id="panel-friends" role="tabpanel" aria-labelledby="tab-friends">
              <h2 className="u-sr-only">Friends</h2>

              <div className="u-between" style={{ marginBlockEnd: 'var(--space-3)' }}>
                <span className="u-micro u-ink-2">
                  {owingCount === 1 ? '1 still owes you' : `${owingCount} still owe you`}
                </span>
                {owingCount > 0 ? (
                  <Button onClick={() => setRemindScope({})}>Remind them</Button>
                ) : null}
              </div>

              <div className="u-row" style={{ gap: 'var(--space-2)' }}>
                <Button
                  variant="solid"
                  block
                  onClick={() => { setJustAdded([]); setAddOpen(true); }}
                >
                  Add friends
                </Button>
                <Button block onClick={() => setGroupOpen(true)}>
                  New group
                </Button>
              </div>

              {friends.length >= 5 ? (
                <div style={{ marginBlockStart: 'var(--space-5)' }}>
                  <SearchField
                    value={search}
                    onChange={setSearch}
                    label="Search friends"
                    placeholder="Search friends"
                  />
                </div>
              ) : null}

              {friends.length === 0 ? (
                <p className="u-ink-2" style={{ marginBlockStart: 'var(--space-5)' }}>
                  No one here yet. Add the people you split with, and every bill
                  you put against them keeps a running balance on this page.
                </p>
              ) : visibleFriends.length === 0 ? (
                <p className="u-ink-2" style={{ marginBlockStart: 'var(--space-5)' }}>
                  No friends match “{search}”.
                </p>
              ) : (
                <ul style={{ marginBlockStart: 'var(--space-5)' }}>
                  {visibleFriends.map((person) => (
                    <SwipeableItem
                      key={person.id}
                      actionLabel={`Remove ${person.name}`}
                      onDelete={() => removeFriend(person)}
                    >
                      <FriendRow
                        person={person}
                        balance={balances[person.id] || 0}
                        reminded={nudgeNote(nudges?.[person.id])}
                        onOpen={() => setDetailPersonId(person.id)}
                      />
                    </SwipeableItem>
                  ))}
                </ul>
              )}
            </section>
          ) : (
            <section id="panel-groups" role="tabpanel" aria-labelledby="tab-groups">
              <h2 className="u-sr-only">Groups</h2>

              <Button variant="solid" block onClick={() => setGroupOpen(true)}>
                New group
              </Button>

              {groups.length === 0 ? (
                <p className="u-ink-2" style={{ marginBlockStart: 'var(--space-5)' }}>
                  No groups yet. A group is a crew you split with often — name it
                  once and the next bill opens with everyone already on it.
                </p>
              ) : (
                <ul style={{ marginBlockStart: 'var(--space-5)' }}>
                  {groups.map((group) => {
                    const members = group.peopleIds
                      .map((id) => people.find((p) => p.id === id))
                      .filter(Boolean);
                    // You are a member of your own groups but never someone who
                    // owes yourself, so your share is out of both counts.
                    const others = members.filter((p) => p.id !== meId);
                    const outstanding = others.reduce(
                      (sum, p) => sum + Math.max(0, balances[p.id] || 0),
                      0,
                    );
                    const owing = others.filter((p) => owes(p.id)).length;

                    return (
                      <SwipeableItem
                        key={group.id}
                        actionLabel={`Remove ${group.name}`}
                        onDelete={() => dropGroup(group)}
                      >
                        <GroupCard
                          group={group}
                          members={members}
                          outstanding={outstanding}
                          owing={owing}
                          onSplit={() => navigate('/new-bill', {
                            state: { peopleIds: group.peopleIds, presetName: group.name },
                          })}
                          onRemind={() => setRemindScope({
                            peopleIds: group.peopleIds,
                            label: group.name,
                            scopeId: group.id,
                          })}
                        />
                      </SwipeableItem>
                    );
                  })}
                </ul>
              )}
            </section>
          )}
        </div>
      </main>

      <UndoToast
        pending={undoable.pending}
        onUndo={undoable.undo}
        onDismiss={undoable.dismiss}
      />

      <Sheet
        open={addOpen}
        title="Add friends"
        onClose={() => { setAddOpen(false); setDraftNames(''); }}
        footer={
          <Button variant="solid" onClick={addNames} disabled={draftNames.trim().length === 0}>
            Add them
          </Button>
        }
      >
        <form onSubmit={addNames} className="u-stack">
          <Field
            label="Names"
            value={draftNames}
            onChange={setDraftNames}
            placeholder="Mika, Rafael, Tina"
            autoComplete="off"
            autoFocus
            hint="One at a time, or paste a list separated by commas."
          />
          {justAdded.length > 0 ? (
            <p className="u-micro u-ink-2">
              Added: {justAdded.join(', ')}
            </p>
          ) : null}
        </form>
      </Sheet>

      <NewGroupForm open={groupOpen} onClose={() => setGroupOpen(false)} />

      <PersonDetail personId={detailPersonId} onClose={() => setDetailPersonId(null)} />

      <ShareSheet
        open={!!remindScope}
        title={remindScope?.label ? `Remind ${remindScope.label}` : 'Remind everyone'}
        actionLabel="Post reminder"
        buildText={buildReminderBody}
        fields={['showPaid', 'showPayInfo']}
        scopes={remindScopes}
        recipients={remindRecipients}
        // No `receipt`: this message spans every unpaid split these people
        // are on, so a picture of one of them would be the wrong object.
        nudgeIds={remindIds}
        onSent={recordNudge}
        activeScopeId={remindScope?.peopleIds ? remindScope.scopeId : ''}
        onScope={(scope) => setRemindScope(
          scope.peopleIds
            ? { peopleIds: scope.peopleIds, label: scope.label, scopeId: scope.id }
            : {},
        )}
        onClose={() => setRemindScope(null)}
      />
    </>
  );
}
