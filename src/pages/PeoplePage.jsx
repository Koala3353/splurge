import { useState, useRef } from 'react';
import { useAppContext } from '../store/AppContext';
import { formatCurrency } from '../utils/format';
import { CheckCircle, Circle, ChevronRight, Plus, X } from 'lucide-react';
import Navigation from '../components/Navigation';
import SwipeableItem from '../components/SwipeableItem';

export default function PeoplePage() {
  const { people, addPerson, removePerson, groups, addGroup, removeGroup, balances, addPayment, personBillShares, lifetimePayments } = useAppContext();
  const [activeTab, setActiveTab] = useState('friends'); // 'friends' | 'groups'
  
  const friendDialogRef = useRef(null);
  const groupDialogRef = useRef(null);
  const detailDialogRef = useRef(null);
  const [detailPersonId, setDetailPersonId] = useState(null);

  const handleAddFriend = (e) => {
    const name = e.target.name.value.trim();
    if (name) { addPerson(name); e.target.reset(); }
  };

  const handleAddGroup = (e) => {
    const name = e.target.groupName.value.trim();
    const selectedOptions = Array.from(e.target.peopleSelect.selectedOptions).map(opt => opt.value);
    if (name && selectedOptions.length > 0) {
      addGroup(name, selectedOptions);
      e.target.reset();
    } else {
      e.preventDefault(); // Prevent closing if invalid
      alert("Please enter a group name and select at least one person.");
    }
  };

  const openDetail = (e, personId) => {
    e.stopPropagation();
    setDetailPersonId(personId);
    detailDialogRef.current?.showModal();
  };

  return (
    <div className="app-shell animate-slide-in">
      <main className="app-main" style={{ paddingBottom: '6rem' }}>
        <h1 className="text-xl mb-4 font-bold">Network</h1>
      
      <div className="flex gap-2 mb-6" style={{ background: 'var(--glass-bg)', padding: '4px', borderRadius: 'var(--radius-lg)' }}>
        <button 
          className={`btn ${activeTab === 'friends' ? 'btn-primary' : ''}`} 
          style={{ flex: 1, border: 'none', background: activeTab === 'friends' ? 'var(--gradient-primary)' : 'transparent', padding: '0.5rem' }}
          onClick={() => setActiveTab('friends')}
        >Friends</button>
        <button 
          className={`btn ${activeTab === 'groups' ? 'btn-primary' : ''}`} 
          style={{ flex: 1, border: 'none', background: activeTab === 'groups' ? 'var(--gradient-primary)' : 'transparent', padding: '0.5rem' }}
          onClick={() => setActiveTab('groups')}
        >Groups</button>
      </div>

      {activeTab === 'friends' && (
        <>
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-lg">Who's paid?</h3>
            <span className="text-secondary">{people.length}</span>
          </div>

          <ul className="SwipeableList mb-10">
            {people.length === 0 ? <p className="text-center text-secondary">No friends yet.</p> : people.map(person => {
              const balance = balances[person.id] || 0;
              const isSettled = balance <= 0;

              return (
                <SwipeableItem key={person.id} onDelete={(e) => { if(e) e.stopPropagation(); removePerson(person.id); }}>
                  <div className="card p-0 overflow-hidden" style={{ padding: 0, marginBottom: 0 }}>
                    <div 
                      className="flex justify-between items-center p-4 cursor-pointer card-hover"
                      onClick={(e) => openDetail(e, person.id)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="avatar bg-accent relative">
                          {person.name.charAt(0).toUpperCase()}
                          {isSettled && <div className="absolute -bottom-1 -right-1 bg-success rounded-full p-0.5 border-2 border-bg"><CheckCircle size={12} /></div>}
                        </div>
                        <div>
                          <h3 className="font-bold text-lg leading-tight">{person.name}</h3>
                          <div className="flex items-center gap-1 text-xs font-medium mt-1" style={{ color: isSettled ? 'var(--success)' : 'var(--text-secondary)' }}>
                            {isSettled ? <CheckCircle size={12} /> : <Circle size={12} />}
                            {isSettled ? 'Paid' : 'Unpaid'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="font-bold text-lg leading-tight">{formatCurrency(balance > 0 ? balance : 0)}</div>
                          <div className="text-xs mt-1" style={{ color: isSettled ? 'var(--success)' : 'var(--text-secondary)' }}>
                            {isSettled ? 'Settled' : 'Pending'}
                          </div>
                        </div>
                        <div className="p-2 bg-glass rounded-full text-secondary">
                          <ChevronRight size={16} />
                        </div>
                      </div>
                    </div>
                  </div>
                </SwipeableItem>
              );
            })}
          </ul>
        </>
      )}

      {activeTab === 'groups' && (
        <ul className="SwipeableList">
          {groups.length === 0 ? <p className="text-center text-secondary">No groups yet.</p> : groups.map(group => (
            <SwipeableItem key={group.id} onDelete={() => removeGroup(group.id)}>
              <div className="glass-panel flex justify-between items-center" style={{ padding: '1rem', border: 'none', marginBottom: 0 }}>
                <div>
                  <h3 className="text-lg font-bold" style={{ color: 'var(--accent-color)' }}>{group.name}</h3>
                  <p className="text-sm text-secondary mt-1">
                    {group.peopleIds.map(id => people.find(p => p.id === id)?.name).filter(Boolean).join(', ')}
                  </p>
                </div>
              </div>
            </SwipeableItem>
          ))}
        </ul>
      )}
      </main>

      {/* Floating Action Button */}
      <button 
        className="fab" 
        style={{ bottom: 'calc(5.5rem + env(safe-area-inset-bottom))' }}
        onClick={() => {
          if(activeTab === 'friends') friendDialogRef.current?.showModal();
          else groupDialogRef.current?.showModal();
        }}
      >
        <Plus size={24} />
      </button>

      {/* Detail Dialog */}
      <dialog 
        ref={detailDialogRef} 
        id="detail-dialog" 
        onClose={() => setDetailPersonId(null)}
        style={{ width: '95vw', maxWidth: '500px', padding: 0, overflow: 'hidden' }}
      >
        {(() => {
          const person = people.find(p => p.id === detailPersonId);
          if (!person) return null;
          
          const balance = balances[person.id] || 0;
          const isSettled = balance <= 0;
          const shares = personBillShares[person.id] || [];
          const lifetime = lifetimePayments[person.id] || 0;

          return (
            <div className="flex flex-col" style={{ maxHeight: '80vh' }}>
              <div className="p-4 border-b border-glass flex justify-between items-center bg-glass" style={{ position: 'sticky', top: 0, zIndex: 10, backdropFilter: 'blur(12px)' }}>
                <div className="flex items-center gap-3">
                  <div className="avatar bg-accent">{person.name.charAt(0).toUpperCase()}</div>
                  <h2 className="text-xl font-bold">{person.name}</h2>
                </div>
                <form method="dialog"><button className="btn bg-glass p-2 rounded-full"><X size={20} /></button></form>
              </div>
              
              <div className="p-4 overflow-y-auto" style={{ flex: 1 }}>
                <div className="flex gap-4 mb-6">
                  <div className="glass-panel flex-1 text-center p-3">
                    <p className="text-xs text-secondary uppercase tracking-wider mb-1">Current Balance</p>
                    <p className="text-xl font-bold text-danger">{formatCurrency(balance > 0 ? balance : 0)}</p>
                  </div>
                  <div className="glass-panel flex-1 text-center p-3">
                    <p className="text-xs text-secondary uppercase tracking-wider mb-1">Lifetime Paid</p>
                    <p className="text-xl font-bold text-success">{formatCurrency(lifetime)}</p>
                  </div>
                </div>

                <h3 className="font-bold text-lg mb-3">Bill History</h3>
                {shares.length === 0 ? (
                  <p className="text-secondary text-sm text-center py-4 glass-panel border-dashed">No bills yet.</p>
                ) : (
                  <div className="flex flex-col gap-2 mb-6">
                    {shares.map((share, idx) => (
                      <div key={idx} className="flex justify-between items-center p-3 glass-panel card-hover cursor-pointer">
                        <div>
                          <p className="font-bold">{share.bill.title}</p>
                          <p className="text-xs text-secondary">{new Date(share.bill.date).toLocaleDateString()}</p>
                        </div>
                        <div className="font-bold text-accent">{formatCurrency(share.amount)}</div>
                      </div>
                    ))}
                  </div>
                )}
                
                {!isSettled && (
                  <div className="mt-4">
                    <h3 className="font-bold text-lg mb-3">Record Payment</h3>
                    <div className="flex gap-2 mb-3">
                      <button className="btn btn-secondary flex-1" style={{ color: 'var(--danger)', borderRadius: 'var(--radius-full)' }} onClick={() => addPayment(person.id, balance / 2)}>Half</button>
                      <button className="btn btn-danger flex-1" style={{ borderRadius: 'var(--radius-full)' }} onClick={() => addPayment(person.id, balance)}>Paid full</button>
                    </div>
                    <form 
                      className="flex gap-2" 
                      onSubmit={(e) => {
                        e.preventDefault();
                        const amt = parseFloat(e.target.amount.value);
                        if(amt > 0) {
                          addPayment(person.id, amt);
                          e.target.reset();
                        }
                      }}
                    >
                      <input 
                        type="number" 
                        name="amount" 
                        step="0.01" 
                        placeholder="Custom amount" 
                        required
                        className="input-ghost flex-1 border border-glass" 
                        style={{ borderRadius: 'var(--radius-full)', padding: '0.75rem 1rem' }}
                      />
                      <button type="submit" className="btn btn-secondary text-primary" style={{ borderRadius: 'var(--radius-full)' }}>Pay</button>
                    </form>
                  </div>
                )}
              </div>
            </div>
          );
        })()}
      </dialog>

      {/* Add Friend/Group Native Dialogs */}
      <dialog ref={friendDialogRef} id="add-friend-dialog">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Add Friend</h2>
          <form method="dialog"><button className="text-secondary"><X size={20} /></button></form>
        </div>
        <form method="dialog" onSubmit={handleAddFriend} className="flex flex-col gap-4">
          <input name="name" type="text" placeholder="Friend's Name" required className="w-full mb-4" />
          <div className="flex gap-2 justify-end">
            <button type="button" className="btn" onClick={() => friendDialogRef.current?.close()}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save Friend</button>
          </div>
        </form>
      </dialog>

      <dialog ref={groupDialogRef} id="add-group-dialog">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Create Group</h2>
          <form method="dialog"><button className="text-secondary"><X size={20} /></button></form>
        </div>
        <form method="dialog" onSubmit={handleAddGroup} className="flex flex-col gap-4">
          <input name="groupName" type="text" placeholder="Group Name (e.g. Office, Family)" required className="w-full mb-4" />
          <p className="text-sm text-secondary mb-2">Select members:</p>
          <select name="peopleSelect" multiple size="4" className="w-full mb-4" style={{ height: 'auto', minHeight: '120px' }}>
            {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div className="flex gap-2 justify-end">
            <button type="button" className="btn" onClick={() => groupDialogRef.current?.close()}>Cancel</button>
            <button type="submit" className="btn btn-primary">Create Group</button>
          </div>
        </form>
      </dialog>

      <Navigation />
    </div>
  );
}
