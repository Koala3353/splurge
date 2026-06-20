import { useState, useRef, useMemo } from 'react';
import { useAppContext } from '../store/AppContext';
import {
  formatCurrency,
  formatRelativeDate,
  initialsOf,
} from '../utils/format';
import {
  Plus,
  X,
  Check,
  Circle,
  CheckCircle,
  ChevronRight,
  Trash2,
  Share2,
  Users,
  Search,
  Pencil,
} from 'lucide-react';
import Navigation from '../components/Navigation';
import SwipeableItem from '../components/SwipeableItem';

export default function PeoplePage() {
  const {
    people,
    addPerson,
    removePerson,
    renamePerson,
    groups,
    addGroup,
    removeGroup,
    meId,
    setMeId,
    balances,
    personBillShares,
    lifetimePayments,
    paymentsByPerson,
    addPayment,
    removePayment,
    buildShareText,
  } = useAppContext();

  const [activeTab, setActiveTab] = useState('friends'); // 'friends' | 'groups'
  const [search, setSearch] = useState('');
  const [detailPersonId, setDetailPersonId] = useState(null);

  const friendDialogRef = useRef(null);
  const groupDialogRef = useRef(null);
  const detailDialogRef = useRef(null);

  // The person who is "you" — never owes themselves, so never listed.
  const me = meId ? people.find((p) => p.id === meId) : null;

  // Everyone except you, sorted: still-owing first (by balance desc), settled last.
  const friends = useMemo(() => {
    const list = people.filter((p) => p.id !== meId);
    return list.sort((a, b) => {
      const balA = balances[a.id] || 0;
      const balB = balances[b.id] || 0;
      const owesA = balA > 0.005;
      const owesB = balB > 0.005;
      if (owesA !== owesB) return owesA ? -1 : 1;
      if (owesA && owesB) return balB - balA;
      return a.name.localeCompare(b.name);
    });
  }, [people, meId, balances]);

  const owingCount = useMemo(
    () => friends.filter((p) => (balances[p.id] || 0) > 0.005).length,
    [friends, balances],
  );

  const visibleFriends = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter((p) => p.name.toLowerCase().includes(q));
  }, [friends, search]);

  const openDetail = (personId) => {
    setDetailPersonId(personId);
    detailDialogRef.current?.showModal();
  };

  const handleAddFriend = (e) => {
    e.preventDefault();
    const name = e.target.name.value.trim();
    if (!name) return;
    addPerson(name);
    e.target.reset();
    friendDialogRef.current?.close();
  };

  return (
    <div className="app-shell animate-slide-in">
      <main className="app-main" style={{ paddingBottom: '6rem' }}>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">People</h1>
          {me && (
            <span
              className="pill pill-inactive flex items-center gap-1 text-xs"
              title="This is you"
            >
              <Users size={12} /> You: {me.name}
            </span>
          )}
        </div>

        {/* Tabs */}
        <div
          className="flex gap-2 mb-6"
          style={{
            background: 'var(--glass-bg)',
            padding: '4px',
            borderRadius: 'var(--radius-lg)',
          }}
        >
          <button
            className="btn"
            style={{
              flex: 1,
              border: 'none',
              background:
                activeTab === 'friends' ? 'var(--gradient-primary)' : 'transparent',
              color: activeTab === 'friends' ? 'white' : 'var(--text-secondary)',
              padding: '0.5rem',
            }}
            onClick={() => setActiveTab('friends')}
          >
            Friends
          </button>
          <button
            className="btn"
            style={{
              flex: 1,
              border: 'none',
              background:
                activeTab === 'groups' ? 'var(--gradient-primary)' : 'transparent',
              color: activeTab === 'groups' ? 'white' : 'var(--text-secondary)',
              padding: '0.5rem',
            }}
            onClick={() => setActiveTab('groups')}
          >
            Groups
          </button>
        </div>

        {activeTab === 'friends' && (
          <>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg">Who&apos;s paid?</h3>
              <span className="text-secondary text-sm">
                {owingCount} {owingCount === 1 ? 'owes you' : 'owe you'}
              </span>
            </div>

            {friends.length >= 5 && (
              <div
                className="flex items-center gap-2 mb-4 glass-panel"
                style={{ padding: '0.5rem 0.85rem' }}
              >
                <Search size={16} className="text-secondary flex-shrink-0" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search friends"
                  aria-label="Search friends"
                  className="input-ghost flex-1 min-w-0"
                />
                {search && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    className="text-secondary flex-shrink-0"
                    onClick={() => setSearch('')}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            )}

            {friends.length === 0 ? (
              <div className="empty-state">
                <Users size={32} className="mx-auto mb-3 text-secondary" />
                <h3 className="font-bold text-lg text-primary">No one here yet</h3>
                <p className="text-sm mt-1">Add the people you splurge with.</p>
              </div>
            ) : visibleFriends.length === 0 ? (
              <div className="empty-state">
                <p className="text-sm">No friends match &ldquo;{search}&rdquo;.</p>
              </div>
            ) : (
              <ul className="SwipeableList">
                {visibleFriends.map((person) => {
                  const balance = balances[person.id] || 0;
                  const isSettled = balance <= 0.005;

                  return (
                    <SwipeableItem
                      key={person.id}
                      onDelete={() => removePerson(person.id)}
                    >
                      <div
                        className="card p-0 overflow-hidden"
                        style={{ padding: 0, marginBottom: 0 }}
                      >
                        <div
                          className="flex justify-between items-center p-4 cursor-pointer card-hover"
                          style={{ opacity: isSettled ? 0.6 : 1 }}
                          onClick={() => openDetail(person.id)}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="avatar bg-accent flex-shrink-0">
                              {initialsOf(person.name)}
                            </div>
                            <div className="min-w-0">
                              <h3 className="font-semibold text-lg leading-tight truncate">
                                {person.name}
                              </h3>
                              <div
                                className="flex items-center gap-1 text-xs font-medium mt-1"
                                style={{
                                  color: isSettled
                                    ? 'var(--success)'
                                    : 'var(--text-secondary)',
                                }}
                              >
                                {isSettled ? (
                                  <CheckCircle size={12} />
                                ) : (
                                  <Circle size={12} />
                                )}
                                {isSettled ? 'Settled' : 'Owes you'}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <div
                              className="font-bold text-lg leading-tight"
                              style={{
                                color: isSettled
                                  ? 'var(--text-secondary)'
                                  : 'var(--text-primary)',
                              }}
                            >
                              {formatCurrency(balance > 0 ? balance : 0)}
                            </div>
                            <ChevronRight size={16} className="text-secondary" />
                          </div>
                        </div>
                      </div>
                    </SwipeableItem>
                  );
                })}
              </ul>
            )}
          </>
        )}

        {activeTab === 'groups' && (
          <>
            {groups.length === 0 ? (
              <div className="empty-state">
                <Users size={32} className="mx-auto mb-3 text-secondary" />
                <h3 className="font-bold text-lg text-primary">No groups yet</h3>
                <p className="text-sm mt-1">Make a crew you split with often.</p>
              </div>
            ) : (
              <ul className="SwipeableList">
                {groups.map((group) => {
                  const memberNames = group.peopleIds
                    .map((id) => people.find((p) => p.id === id)?.name)
                    .filter(Boolean);
                  return (
                    <SwipeableItem
                      key={group.id}
                      onDelete={() => removeGroup(group.id)}
                    >
                      <div
                        className="glass-panel flex items-center justify-between"
                        style={{ padding: '1rem', marginBottom: 0 }}
                      >
                        <div className="min-w-0">
                          <h3
                            className="text-lg font-bold truncate"
                            style={{ color: 'var(--accent-color)' }}
                          >
                            {group.name}
                          </h3>
                          <p className="text-sm text-secondary mt-1 truncate">
                            {memberNames.length
                              ? memberNames.join(', ')
                              : 'No members'}
                          </p>
                        </div>
                        <span className="text-xs text-secondary flex items-center gap-1 flex-shrink-0 ml-2">
                          <Users size={12} />
                          {memberNames.length}
                        </span>
                      </div>
                    </SwipeableItem>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </main>

      {/* Floating Action Button */}
      <button
        className="fab"
        aria-label={activeTab === 'friends' ? 'Add friend' : 'New group'}
        style={{ bottom: 'calc(5.5rem + env(safe-area-inset-bottom))' }}
        onClick={() => {
          if (activeTab === 'friends') friendDialogRef.current?.showModal();
          else groupDialogRef.current?.showModal();
        }}
      >
        <Plus size={24} />
      </button>

      {/* Person detail */}
      <dialog
        ref={detailDialogRef}
        onClose={() => setDetailPersonId(null)}
        style={{ width: '95vw', maxWidth: '500px', padding: 0, overflow: 'hidden' }}
      >
        <PersonDetail
          personId={detailPersonId}
          people={people}
          meId={meId}
          setMeId={setMeId}
          balances={balances}
          personBillShares={personBillShares}
          lifetimePayments={lifetimePayments}
          paymentsByPerson={paymentsByPerson}
          addPayment={addPayment}
          removePayment={removePayment}
          renamePerson={renamePerson}
          buildShareText={buildShareText}
          onClose={() => detailDialogRef.current?.close()}
        />
      </dialog>

      {/* Add friend */}
      <dialog ref={friendDialogRef}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Add friend</h2>
          <form method="dialog">
            <button className="text-secondary" aria-label="Close">
              <X size={20} />
            </button>
          </form>
        </div>
        <form onSubmit={handleAddFriend} className="flex flex-col gap-4">
          <input
            name="name"
            type="text"
            placeholder="Their name"
            required
            autoComplete="off"
          />
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => friendDialogRef.current?.close()}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Add
            </button>
          </div>
        </form>
      </dialog>

      {/* New group */}
      <dialog ref={groupDialogRef} onClose={() => setSearch('')}>
        <NewGroupForm
          people={people}
          meId={meId}
          addGroup={addGroup}
          onClose={() => groupDialogRef.current?.close()}
        />
      </dialog>

      <Navigation />
    </div>
  );
}

function NewGroupForm({ people, meId, addGroup, onClose }) {
  const [name, setName] = useState('');
  const [selected, setSelected] = useState([]);

  const candidates = people.filter((p) => p.id !== meId);

  const toggle = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const trimmed = name.trim();
  const canCreate = trimmed.length > 0 && selected.length > 0;

  const reset = () => {
    setName('');
    setSelected([]);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canCreate) return;
    addGroup(trimmed, selected);
    reset();
    onClose();
  };

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">New group</h2>
        <form method="dialog">
          <button
            type="button"
            className="text-secondary"
            aria-label="Close"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            <X size={20} />
          </button>
        </form>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Barkada, Officemates…"
          autoComplete="off"
        />

        <div>
          <p className="text-sm text-secondary mb-2">Who&apos;s in?</p>
          {candidates.length === 0 ? (
            <p className="text-sm text-secondary">
              Add some friends first, then group them.
            </p>
          ) : (
            <div className="flex gap-2 flex-wrap">
              {candidates.map((p) => {
                const isSel = selected.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`pill ${isSel ? 'pill-active' : 'pill-inactive'} flex items-center gap-1`}
                    onClick={() => toggle(p.id)}
                  >
                    {isSel ? <Check size={14} /> : <Plus size={14} />} {p.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            style={canCreate ? null : { opacity: 0.45 }}
            disabled={!canCreate}
          >
            Create group
          </button>
        </div>
      </form>
    </>
  );
}

function PersonDetail({
  personId,
  people,
  meId,
  setMeId,
  balances,
  personBillShares,
  lifetimePayments,
  paymentsByPerson,
  addPayment,
  removePayment,
  renamePerson,
  buildShareText,
  onClose,
}) {
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [customAmount, setCustomAmount] = useState('');
  const [copied, setCopied] = useState(false);

  const person = people.find((p) => p.id === personId);
  if (!person) return null;

  const balance = balances[person.id] || 0;
  const owed = balance > 0 ? balance : 0;
  const shares = personBillShares[person.id] || [];
  const lifetime = lifetimePayments[person.id] || 0;
  const payments = [...(paymentsByPerson[person.id] || [])].sort(
    (a, b) => new Date(b.date) - new Date(a.date),
  );
  const isMe = person.id === meId;
  const canPayQuick = owed > 0.005;
  const customValid = parseFloat(customAmount) > 0;
  const dimStyle = (off) => (off ? { opacity: 0.45 } : null);

  const startEdit = () => {
    setDraftName(person.name);
    setEditingName(true);
  };

  const saveName = (e) => {
    e.preventDefault();
    const next = draftName.trim();
    if (next) renamePerson(person.id, next);
    setEditingName(false);
  };

  const logCustom = (e) => {
    e.preventDefault();
    const amt = parseFloat(customAmount);
    if (amt > 0) {
      addPayment(person.id, amt);
      setCustomAmount('');
    }
  };

  const sendRequest = async () => {
    const text = buildShareText(person.id);
    if (navigator.share) {
      try {
        await navigator.share({ text });
      } catch {
        // User cancelled or share failed — nothing to do.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard unavailable — fail quietly.
    }
  };

  return (
    <div className="flex flex-col" style={{ maxHeight: '85vh' }}>
      {/* Header */}
      <div
        className="p-4 border-b border-glass flex justify-between items-center bg-glass"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          backdropFilter: 'blur(12px)',
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="avatar bg-accent flex-shrink-0">
            {initialsOf(person.name)}
          </div>
          {editingName ? (
            <form onSubmit={saveName} className="flex items-center gap-2 min-w-0">
              <input
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                aria-label="Edit name"
                autoFocus
                className="text-lg font-bold min-w-0"
                style={{ padding: '0.35rem 0.6rem' }}
              />
              <button
                type="submit"
                className="text-success flex-shrink-0"
                aria-label="Save name"
              >
                <Check size={20} />
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="text-xl font-bold truncate">{person.name}</h2>
              <button
                type="button"
                onClick={startEdit}
                className="text-secondary flex-shrink-0"
                aria-label="Rename"
              >
                <Pencil size={16} />
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          className="bg-glass p-2 rounded-full flex-shrink-0"
          aria-label="Close"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>

      <div className="p-4 overflow-y-auto custom-scrollbar" style={{ flex: 1 }}>
        {/* Stat tiles */}
        <div className="flex gap-3 mb-6">
          <div className="glass-panel flex-1 text-center" style={{ padding: '0.85rem' }}>
            <p className="text-xs text-secondary uppercase tracking-wider mb-1">
              Owes you now
            </p>
            <p
              className="text-xl font-bold"
              style={{ color: owed > 0 ? 'var(--danger)' : 'var(--success)' }}
            >
              {formatCurrency(owed)}
            </p>
          </div>
          <div className="glass-panel flex-1 text-center" style={{ padding: '0.85rem' }}>
            <p className="text-xs text-secondary uppercase tracking-wider mb-1">
              Paid back
            </p>
            <p className="text-xl font-bold text-success">
              {formatCurrency(lifetime)}
            </p>
          </div>
        </div>

        {/* Their splits */}
        <h3 className="font-bold text-lg mb-3">Their splits</h3>
        {shares.length === 0 ? (
          <p className="text-secondary text-sm text-center py-4 glass-panel">
            No splits yet.
          </p>
        ) : (
          <div className="flex flex-col gap-2 mb-6">
            {shares.map((share, idx) => (
              <div
                key={idx}
                className="flex justify-between items-center glass-panel"
                style={{ padding: '0.75rem' }}
              >
                <div className="min-w-0">
                  <p className="font-semibold truncate">{share.bill.title}</p>
                  <p className="text-xs text-secondary">
                    {formatRelativeDate(share.bill.date)}
                  </p>
                </div>
                <div className="font-bold text-accent flex-shrink-0 ml-2">
                  {formatCurrency(share.amount)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Log a payment */}
        <h3 className="font-bold text-lg mb-3 mt-2">Log a payment</h3>
        <div className="flex gap-2 mb-3">
          <button
            type="button"
            className="btn btn-secondary flex-1"
            style={{ borderRadius: 'var(--radius-full)', ...dimStyle(!canPayQuick) }}
            disabled={!canPayQuick}
            onClick={() => addPayment(person.id, owed / 2)}
          >
            Half
          </button>
          <button
            type="button"
            className="btn btn-success flex-1"
            style={{ borderRadius: 'var(--radius-full)', ...dimStyle(!canPayQuick) }}
            disabled={!canPayQuick}
            onClick={() => addPayment(person.id, owed)}
          >
            All paid
          </button>
        </div>
        <form onSubmit={logCustom} className="flex gap-2 mb-6">
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            placeholder="Other amount"
            aria-label="Other amount"
            className="flex-1 min-w-0"
            style={{ borderRadius: 'var(--radius-full)' }}
          />
          <button
            type="submit"
            className="btn btn-secondary flex-shrink-0"
            style={{ borderRadius: 'var(--radius-full)', ...dimStyle(!customValid) }}
            disabled={!customValid}
          >
            Log
          </button>
        </form>

        {/* Payment history */}
        {payments.length > 0 && (
          <>
            <h3 className="font-bold text-lg mb-3">Payments</h3>
            <div className="flex flex-col gap-2 mb-6">
              {payments.map((pm) => (
                <div
                  key={pm.id}
                  className="flex justify-between items-center glass-panel"
                  style={{ padding: '0.6rem 0.75rem' }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="bg-success rounded-full p-1 flex-shrink-0">
                      <Check size={12} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold">{formatCurrency(pm.amount)}</p>
                      <p className="text-xs text-secondary">
                        {formatRelativeDate(pm.date)}
                        {pm.note ? ` · ${pm.note}` : ''}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="text-secondary flex-shrink-0 p-2"
                    aria-label="Undo payment"
                    onClick={() => removePayment(pm.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Send request */}
        <button
          type="button"
          className="btn btn-primary w-full"
          style={{ borderRadius: 'var(--radius-full)' }}
          onClick={sendRequest}
        >
          <Share2 size={18} />
          {copied ? 'Copied' : 'Send request'}
        </button>

        {/* Subtle self toggle */}
        {!isMe && (
          <button
            type="button"
            className="text-xs text-secondary mt-4 mx-auto block"
            onClick={() => setMeId(person.id)}
          >
            This is me
          </button>
        )}
      </div>
    </div>
  );
}
