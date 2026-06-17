import { useState } from 'react';
import { useAppContext } from '../store/AppContext';
import { formatCurrency } from '../utils/format';
import { CheckCircle, Circle, ChevronDown, ChevronUp } from 'lucide-react';
import Navigation from '../components/Navigation';
import SwipeableItem from '../components/SwipeableItem';

export default function PeoplePage() {
  const { people, addPerson, removePerson, groups, addGroup, removeGroup, balances, addPayment } = useAppContext();
  const [activeTab, setActiveTab] = useState('friends'); // 'friends' | 'groups'
  const [expandedId, setExpandedId] = useState(null);

  const handleAddFriend = (e) => {
    e.preventDefault();
    const name = e.target.name.value.trim();
    if (name) { addPerson(name); e.target.reset(); }
  };

  const handleAddGroup = (e) => {
    e.preventDefault();
    const name = e.target.groupName.value.trim();
    const selectedOptions = Array.from(e.target.peopleSelect.selectedOptions).map(opt => opt.value);
    if (name && selectedOptions.length > 0) {
      addGroup(name, selectedOptions);
      e.target.reset();
    } else {
      alert("Please enter a group name and select at least one person.");
    }
  };

  return (
    <div className="app-shell animate-slide-in">
      <main className="app-main">
        <h1 className="text-xl mb-4">Network</h1>
      
      <div className="flex gap-2 mb-6" style={{ background: 'var(--glass-bg)', padding: '4px', borderRadius: 'var(--radius-lg)' }}>
        <button 
          className={`btn ${activeTab === 'friends' ? 'btn-primary' : ''}`} 
          style={{ flex: 1, border: 'none', background: activeTab === 'friends' ? 'var(--gradient-primary)' : 'transparent' }}
          onClick={() => setActiveTab('friends')}
        >Friends</button>
        <button 
          className={`btn ${activeTab === 'groups' ? 'btn-primary' : ''}`} 
          style={{ flex: 1, border: 'none', background: activeTab === 'groups' ? 'var(--gradient-primary)' : 'transparent' }}
          onClick={() => setActiveTab('groups')}
        >Groups</button>
      </div>

      {activeTab === 'friends' && (
        <>
          <form onSubmit={handleAddFriend} className="flex gap-2 mb-6">
            <input name="name" type="text" placeholder="Friend's Name" required />
            <button type="submit" className="btn btn-primary" style={{ borderRadius: 'var(--radius-full)' }}>Add</button>
          </form>

          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-lg">Who's paid?</h3>
            <span className="text-secondary">{people.length}</span>
          </div>

          <ul className="SwipeableList mb-10">
            {people.length === 0 ? <p className="text-center text-secondary">No friends yet.</p> : people.map(person => {
              const balance = balances[person.id] || 0;
              const isSettled = balance <= 0;
              const isExpanded = expandedId === person.id;

              return (
                <SwipeableItem key={person.id} onDelete={(e) => { if(e) e.stopPropagation(); removePerson(person.id); }}>
                  <div className="card p-0 overflow-hidden" style={{ padding: 0, marginBottom: 0 }}>
                    <div 
                      className="flex justify-between items-center p-4 cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : person.id)}
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
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="p-4 bg-glass border-t border-glass" style={{ margin: '0 0.5rem 0.5rem 0.5rem', borderRadius: 'var(--radius-md)' }}>
                        <div className="flex justify-between items-center mb-4">
                          <div className="text-secondary">
                            <div className="font-medium text-primary">Due</div>
                            <div className="text-xs">Calculated {formatCurrency(balance > 0 ? balance : 0)}</div>
                          </div>
                          <div className="bg-glass px-3 py-2 rounded-md font-bold">{formatCurrency(balance > 0 ? balance : 0)}</div>
                        </div>
                        
                        <div className="flex justify-between items-center mb-6">
                          <div className="text-secondary">
                            <div className="font-medium text-primary">Paid</div>
                          </div>
                          <div className="bg-glass px-3 py-2 rounded-md font-bold">₱ 0.00</div>
                        </div>
                        
                        <div className="flex-col gap-2">
                          {!isSettled && (
                            <>
                              <div className="flex gap-2">
                                <button className="btn btn-secondary flex-1" style={{ color: 'var(--danger)', borderRadius: 'var(--radius-full)' }} onClick={(e) => { e.stopPropagation(); addPayment(person.id, balance / 2); }}>Half</button>
                                <button className="btn btn-danger flex-1" style={{ borderRadius: 'var(--radius-full)' }} onClick={(e) => { e.stopPropagation(); addPayment(person.id, balance); }}>Paid full</button>
                              </div>
                              <form 
                                className="flex gap-2 mt-2" 
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
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
                            </>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </SwipeableItem>
              );
            })}
          </ul>
        </>
      )}

      {activeTab === 'groups' && (
        <>
          <form onSubmit={handleAddGroup} className="flex-col gap-3 mb-6 p-4 glass-panel" style={{ padding: '1rem' }}>
            <h3 className="text-lg">Create New Group</h3>
            <input name="groupName" type="text" placeholder="Group Name (e.g. Office, Family)" required />
            <select name="peopleSelect" multiple size="4" style={{ height: 'auto' }}>
              {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <p className="text-sm text-secondary">Hold Ctrl/Cmd to select multiple people.</p>
            <button type="submit" className="btn btn-primary mt-2">Create Group</button>
          </form>

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
        </>
      )}
      </main>
      <Navigation />
    </div>
  );
}
