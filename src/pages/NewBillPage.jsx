import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../store/AppContext';
import { formatCurrency } from '../utils/format';
import Tesseract from 'tesseract.js';
import { flushSync } from 'react-dom';
import { Camera, Plus, Trash2, Check, Loader2, ChevronRight, ChevronLeft, ChevronDown, Users, UserPlus, Sparkles, CheckCircle } from 'lucide-react';
import SwipeableItem from '../components/SwipeableItem';

export default function NewBillPage() {
  const { people, groups, addPerson, addBill } = useAppContext();
  const navigate = useNavigate();
  
  const [step, setStep] = useState(1); // 1: People, 2: Items, 3: Review

  const handleStepChange = (newStep) => {
    const direction = newStep > step ? 'forward' : 'backward';
    if (!document.startViewTransition) {
      setStep(newStep);
      return;
    }
    document.startViewTransition({
      update: () => {
        flushSync(() => {
          setStep(newStep);
        });
      },
      types: [direction]
    });
  };
  
  // Step 1 State
  const [splitName, setSplitName] = useState('Untitled Split');
  const [selectedPeople, setSelectedPeople] = useState([]);
  const [newPersonName, setNewPersonName] = useState('');
  
  // Step 2 State
  const [image, setImage] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrProgress, setOcrProgress] = useState('Loading scanner...');
  const [items, setItems] = useState([]);
  const fileInputRef = useRef(null);

  // Step 3 State
  const [fees, setFees] = useState([]);

  // --- Header Helpers ---
  const stepTitles = {
    1: { title: 'People', subtitle: '1 of 3 · Name the split and add who is joining.' },
    2: { title: 'Items', subtitle: '2 of 3 · Enter each receipt line.' },
    3: { title: 'Review', subtitle: '3 of 3 · Check totals before saving.' }
  };

  // --- STEP 1: Select People ---
  const handleGroupSelect = (groupId) => {
    const group = groups.find(g => g.id === groupId);
    if (group) {
      const newSelections = new Set([...selectedPeople, ...group.peopleIds]);
      setSelectedPeople(Array.from(newSelections));
    }
  };

  const togglePerson = (id) => {
    setSelectedPeople(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };

  const handleAddPersonSubmit = (e) => {
    e.preventDefault();
    if (newPersonName.trim()) {
      addPerson(newPersonName.trim());
      setNewPersonName('');
    }
  };

  const handleAddMe = () => {
    let me = people.find(p => p.name.toLowerCase() === 'me' || p.name.toLowerCase() === 'you');
    if (!me) {
      addPerson('Me');
      // Hack to wait for render, or just rely on them clicking it again from the saved list
      // In a real app we'd get the returned ID from addPerson
      setTimeout(() => {
        // ... handled manually for now
      }, 100);
    } else {
      if (!selectedPeople.includes(me.id)) {
        setSelectedPeople([...selectedPeople, me.id]);
      }
    }
  };

  // --- STEP 2: Items & OCR ---
  const handleImageCapture = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setImage(URL.createObjectURL(file));
    setIsProcessing(true);
    setOcrProgress('Optimizing image...');

    try {
      // Downscale image to prevent Out-Of-Memory crashes on mobile browsers
      const img = new Image();
      img.src = URL.createObjectURL(file);
      await new Promise(resolve => { img.onload = resolve; });
      
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 1200;
      const MAX_HEIGHT = 1200;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height = Math.round((height *= MAX_WIDTH / width));
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width = Math.round((width *= MAX_HEIGHT / height));
          height = MAX_HEIGHT;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));

      setOcrProgress('Initializing OCR...');
      const result = await Tesseract.recognize(blob, 'eng', {
        logger: m => {
          if (m.status === 'recognizing text') {
            setOcrProgress(`Scanning text: ${Math.round(m.progress * 100)}%`);
          } else {
            setOcrProgress('Loading language data...');
          }
        }
      });
      
      const lines = result.data.text.split('\\n');
      const parsedItems = [];
      const priceRegex = /-?\\$?\\d+\\.\\d{2}/;
      const skipKeywords = ['total', 'subtotal', 'tax', 'tip', 'gratuity', 'payment', 'change', 'cash', 'card', 'visa', 'mastercard', 'amex', 'amount', 'due', 'balance', 'fee', 'service', 'gross', 'sales'];
      
      lines.forEach(line => {
        const lowerLine = line.toLowerCase();
        
        // Skip lines that look like totals, taxes, or payments
        if (skipKeywords.some(kw => lowerLine.includes(kw))) {
          return;
        }

        const match = line.match(priceRegex);
        if (match) {
          const priceStr = match[0].replace('$', '');
          const price = parseFloat(priceStr);
          
          let name = line.replace(match[0], '').replace(/[^a-zA-Z\\s]/g, '').trim();
          name = name || 'Item';
          
          // Only add valid items with a price > 0
          if (price > 0 && name.length > 1) {
            parsedItems.push({ id: crypto.randomUUID(), name, price, people: [...selectedPeople] });
          }
        }
      });
      
      setItems(parsedItems.length > 0 ? parsedItems : [{ id: crypto.randomUUID(), name: 'Item', price: 0, people: [...selectedPeople] }]);
    } catch (error) {
      console.error(error);
      setItems([{ id: crypto.randomUUID(), name: 'Item', price: 0, people: [...selectedPeople] }]);
    } finally {
      setIsProcessing(false);
    }
  };

  const updateItem = (id, field, value) => {
    setItems(items.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const togglePersonForItem = (itemId, personId) => {
    setItems(items.map(item => {
      if (item.id === itemId) {
        const newPeople = item.people.includes(personId) 
          ? item.people.filter(p => p !== personId)
          : [...item.people, personId];
        return { ...item, people: newPeople };
      }
      return item;
    }));
  };

  // --- STEP 3: Fees & Review ---
  const addFee = () => setFees([...fees, { id: crypto.randomUUID(), name: 'Service charge', amount: 0 }]);
  const updateFee = (id, field, val) => setFees(fees.map(f => f.id === id ? { ...f, [field]: val } : f));
  const removeFee = (id) => setFees(fees.filter(f => f.id !== id));

  const itemsTotal = items.reduce((sum, item) => sum + item.price, 0);
  const feesTotal = fees.reduce((sum, fee) => sum + fee.amount, 0);
  const finalTotal = itemsTotal + feesTotal;

  // Calculate what each selected person owes
  const calculatedDues = {};
  selectedPeople.forEach(p => calculatedDues[p] = 0);

  items.forEach(item => {
    if (item.people.length > 0) {
      const split = item.price / item.people.length;
      item.people.forEach(pId => {
        if (calculatedDues[pId] !== undefined) calculatedDues[pId] += split;
      });
    }
  });

  if (itemsTotal !== 0 && feesTotal !== 0) {
    selectedPeople.forEach(pId => {
      const proportion = calculatedDues[pId] / itemsTotal;
      calculatedDues[pId] += (feesTotal * proportion);
    });
  } else if (itemsTotal === 0 && feesTotal !== 0 && selectedPeople.length > 0) {
    const split = feesTotal / selectedPeople.length;
    selectedPeople.forEach(pId => calculatedDues[pId] += split);
  }

  const handleSave = () => {
    addBill({
      title: splitName,
      items,
      fees,
      total: finalTotal,
      participants: selectedPeople
    });
    navigate('/');
  };

  return (
    <div className="app-shell animate-slide-in">
      
      {/* TOP HEADER */}
      <header className="app-header">
        <div className="flex justify-between items-center mb-4">
          <button className="btn p-2" style={{ borderRadius: '50%', background: 'var(--glass-bg)' }} onClick={() => step > 1 ? handleStepChange(step - 1) : navigate('/')}>
            <ChevronLeft size={20} />
          </button>
          <div className="flex gap-2">
            <button className="btn p-2 text-danger" style={{ background: 'rgba(244,63,94,0.1)', borderRadius: '50%' }}><Trash2 size={20} /></button>
            <div className="text-right">
              <div className="font-bold">{formatCurrency(finalTotal)}</div>
              <div className="text-xs text-secondary">total</div>
            </div>
          </div>
        </div>
        
        <h1 className="text-2xl font-bold mb-1">{stepTitles[step].title}</h1>
        <p className="text-sm text-secondary mb-3">{stepTitles[step].subtitle}</p>
        
        {/* Progress Bar */}
        <div className="flex gap-1">
          {[1, 2, 3].map(s => (
            <div key={s} style={{ flex: 1, height: '4px', borderRadius: '2px', background: s <= step ? 'var(--accent-color)' : 'var(--glass-bg)' }} />
          ))}
        </div>
      </header>

      <main className="app-main">
        
        {/* STEP 1 */}
        {step === 1 && (
          <>
            <div className="card">
              <div className="text-xs text-secondary font-bold uppercase mb-2 tracking-wider">Split Name</div>
              <input type="text" className="input-ghost text-xl font-bold w-full" value={splitName} onChange={e => setSplitName(e.target.value)} placeholder="Untitled Split" />
            </div>

            {groups.length > 0 && (
              <div className="card">
                <h3 className="font-bold text-lg mb-1">Regular groups</h3>
                <p className="text-sm text-secondary mb-4">Tap one to bring everyone in.</p>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {groups.map(g => (
                    <div key={g.id} className="cursor-pointer" style={{ background: 'rgba(16,185,129,0.1)', borderRadius: 'var(--radius-lg)', padding: '1rem', minWidth: '160px' }} onClick={() => handleGroupSelect(g.id)}>
                      <Users size={24} className="text-success mb-2" />
                      <h4 className="font-bold">{g.name}</h4>
                      <p className="text-xs text-secondary mt-1 truncate">{g.peopleIds.map(id => people.find(p => p.id === id)?.name).filter(Boolean).join(', ')}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="card">
              <h3 className="font-bold text-lg mb-4">People</h3>
              
              <form onSubmit={handleAddPersonSubmit} className="flex gap-2 mb-4">
                <div className="flex-1 flex items-center gap-2 border border-glass rounded-lg px-3 py-2">
                  <UserPlus size={18} className="text-secondary" />
                  <input type="text" className="input-ghost flex-1" placeholder="Name" value={newPersonName} onChange={e => setNewPersonName(e.target.value)} />
                </div>
                <button type="submit" className="btn bg-glass px-4 rounded-lg"><Plus size={20} /></button>
              </form>

              <button className="btn w-full flex items-center gap-2 mb-6" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--text-primary)', padding: '1rem', borderRadius: 'var(--radius-lg)' }} onClick={handleAddMe}>
                <div className="bg-success text-bg rounded-full p-1"><Plus size={14} /></div>
                <span className="font-bold">Add yourself</span>
              </button>

              <p className="text-sm text-secondary mb-3">Add yourself, then everyone splitting the bill.</p>
              <div className="text-xs text-secondary font-bold uppercase mb-2">Saved</div>
              
              <div className="flex gap-2 flex-wrap">
                {people.map(p => {
                  const isSel = selectedPeople.includes(p.id);
                  return (
                    <button key={p.id} className={`pill ${isSel ? 'pill-active' : 'pill-inactive'} flex items-center gap-1`} onClick={() => togglePerson(p.id)}>
                      {isSel ? <Check size={14} /> : <Plus size={14} />} {p.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <>
            {items.length === 0 && !isProcessing && (
              <div className="card text-center py-10">
                <h3 className="font-bold text-xl mb-6">Add what everyone ordered</h3>
                <input type="file" accept="image/*" capture="environment" ref={fileInputRef} onChange={handleImageCapture} style={{ display: 'none' }} />
                
                <div className="flex gap-4 justify-center">
                  <button className="btn btn-secondary flex-col items-center p-4 rounded-xl flex-1" onClick={() => setItems([{ id: crypto.randomUUID(), name: 'Item', price: 0, people: [...selectedPeople] }])}>
                    <Plus size={32} className="mb-2 text-primary" />
                    <span>Manual Entry</span>
                  </button>
                  <button className="btn" style={{ background: 'rgba(236,72,153,0.1)', color: 'var(--accent-color)', padding: '1rem', borderRadius: 'var(--radius-lg)', flex: 1 }} onClick={() => fileInputRef.current?.click()}>
                    <Sparkles size={32} className="mb-2 mx-auto" />
                    <span>Scan Receipt</span>
                  </button>
                </div>
              </div>
            )}

            {isProcessing && (
               <div className="scanner-overlay animate-slide-in">
                 <h2 className="text-3xl font-black mb-2 text-center text-accent">Scanning Receipt</h2>
                 <p className="text-secondary text-center mb-8">Please wait while we extract the line items.</p>
                 
                 <div className="scanner-laser-container">
                   <div className="scanner-laser"></div>
                   {image && <img src={image} className="scanner-image" alt="Receipt processing" />}
                   {!image && <div className="w-full h-full bg-glass flex items-center justify-center"><Loader2 size={40} className="animate-spin text-secondary" /></div>}
                 </div>
                 
                 <div className="card w-full max-w-[320px] border-glass p-4 text-center bg-glass flex flex-col items-center gap-3">
                    <Loader2 size={24} className="animate-spin text-accent" />
                    <p className="font-bold tracking-wider uppercase text-sm text-primary">{ocrProgress}</p>
                 </div>
               </div>
            )}

            {!isProcessing && items.length > 0 && (
              <div className="flex-col gap-4">
                <div className="flex justify-between items-center mb-2 px-2">
                  <span className="text-sm text-secondary font-bold uppercase">Subtotal</span>
                  <span className="font-bold">{formatCurrency(itemsTotal)}</span>
                </div>

                <ul className="SwipeableList">
                {items.map(item => (
                  <SwipeableItem key={item.id} onDelete={() => setItems(items.filter(i => i.id !== item.id))}>
                    <div className="card p-0 overflow-hidden" style={{ padding: 0, marginBottom: 0 }}>
                      <div className="flex justify-between items-center p-4 border-b border-glass">
                        <div className="flex items-center gap-3 flex-1">
                          <div className="text-success"><CheckCircle size={24} /></div>
                          <input type="text" className="input-ghost text-lg font-bold w-full" placeholder="Item Name" value={item.name} onChange={e => updateItem(item.id, 'name', e.target.value)} />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-secondary font-medium">₱</span>
                          <input type="number" step="0.01" className="input-ghost text-xl font-bold text-right" style={{ width: '80px' }} value={item.price || ''} onChange={e => updateItem(item.id, 'price', parseFloat(e.target.value) || 0)} />
                        </div>
                      </div>
                      
                      <div className="p-4 bg-glass flex justify-between items-center">
                        <span className="text-sm text-secondary">Who shared this?</span>
                        <button 
                          popovertarget={`popover-${item.id}`} 
                          className="btn text-xs px-3 py-1.5" 
                          style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 'var(--radius-full)' }}
                        >
                          {item.people.length === selectedPeople.length ? 'Everyone' : `${item.people.length} people`} <ChevronDown size={14} className="inline ml-1" />
                        </button>
                        
                        <div id={`popover-${item.id}`} popover="auto">
                          <h4 className="font-bold mb-3">Who shared this?</h4>
                          <div className="flex-col gap-2">
                            {selectedPeople.map(pId => {
                              const person = people.find(p => p.id === pId);
                              const isSel = item.people.includes(pId);
                              return (
                                <button key={pId} className={`w-full text-left p-3 rounded-lg flex items-center justify-between mb-2 ${isSel ? 'bg-success text-bg font-bold' : 'bg-glass text-primary'}`} onClick={() => togglePersonForItem(item.id, pId)}>
                                  {person?.name}
                                  {isSel && <CheckCircle size={16} />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  </SwipeableItem>
                ))}
                </ul>
                
                <div className="card text-center cursor-pointer mb-6 border-dashed" onClick={() => setItems([...items, { id: crypto.randomUUID(), name: 'Item', price: 0, people: [...selectedPeople] }])}>
                  <Plus size={20} className="inline mr-2" /> Add another item
                </div>
              </div>
            )}
          </>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <>
            <div className="card mb-6 p-0" style={{ padding: 0 }}>
              <div className="p-4 border-b border-glass flex justify-between items-center cursor-pointer" onClick={addFee}>
                <div className="flex items-center gap-3">
                  <div style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)', padding: '0.5rem', borderRadius: '50%' }}><Plus size={20} /></div>
                  <div>
                    <h3 className="font-bold text-lg">Fees, tips, discounts</h3>
                    <p className="text-sm text-secondary">Optional charges and deductions</p>
                  </div>
                </div>
                <div className="font-bold">{formatCurrency(feesTotal)}</div>
              </div>
              
              {fees.length > 0 && (
                <ul className="SwipeableList p-4">
                  {fees.map(fee => (
                    <SwipeableItem key={fee.id} onDelete={() => removeFee(fee.id)}>
                      <div className="flex-col gap-3 p-4 bg-glass border border-glass rounded-lg">
                        <div className="text-xs text-secondary font-bold uppercase tracking-wider">Name</div>
                        <input type="text" className="input-ghost text-lg font-bold w-full border-b border-glass pb-2" value={fee.name} onChange={e => updateFee(fee.id, 'name', e.target.value)} />
                        
                        <div className="text-xs text-secondary font-bold uppercase tracking-wider mt-2">Amount</div>
                        <div className="flex gap-2 items-center">
                          <span className="text-secondary font-medium">₱</span>
                          <input type="number" step="0.01" className="input-ghost text-xl font-bold flex-1" value={fee.amount || ''} onChange={e => updateFee(fee.id, 'amount', parseFloat(e.target.value) || 0)} />
                        </div>
                      </div>
                    </SwipeableItem>
                  ))}
                  <button className="btn btn-danger w-full mt-2" style={{ borderRadius: 'var(--radius-lg)' }} onClick={addFee}>+ Add</button>
                </ul>
              )}
            </div>

            <div className="card p-0 overflow-hidden" style={{ padding: 0 }}>
              <div className="p-4 border-b border-glass flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <div className="bg-glass text-accent p-2 rounded-full border border-glass">₱</div>
                  <div className="font-bold text-lg">Currency</div>
                </div>
                <div className="text-danger font-bold">PHP ₱</div>
              </div>
              
              <div className="p-4 border-b border-glass">
                <p className="text-sm text-secondary mb-1">Final total</p>
                <h2 className="text-5xl font-black">{formatCurrency(finalTotal)}</h2>
              </div>
              
              <div className="p-4 border-b border-glass">
                <div className="flex justify-between text-sm text-secondary mb-2">
                  <span>Items</span>
                  <span>{formatCurrency(itemsTotal)}</span>
                </div>
                <div className="flex justify-between text-sm text-secondary">
                  <span>Adjustments</span>
                  <span>{formatCurrency(feesTotal)}</span>
                </div>
              </div>
              
              <div className="p-4">
                <div className="flex-col gap-2">
                  {selectedPeople.map(pId => {
                    const person = people.find(p => p.id === pId);
                    return (
                      <div key={pId} className="flex justify-between items-center py-2">
                        <div className="flex items-center gap-3">
                          <div className="avatar bg-accent">{person?.name.charAt(0).toUpperCase()}</div>
                          <div className="font-bold">{person?.name}</div>
                        </div>
                        <div className="font-bold text-lg">{formatCurrency(calculatedDues[pId])}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        )}

      </main>

      {/* BOTTOM BAR */}
      <footer className="app-footer">
        <button 
          className="btn btn-secondary flex-1" 
          style={{ borderRadius: 'var(--radius-lg)' }}
          onClick={() => step > 1 ? handleStepChange(step - 1) : navigate('/')}
        >
          <ChevronLeft size={20} className="inline mr-1" /> Back
        </button>
        
        {step < 3 ? (
          <button 
            className="btn btn-danger" 
            style={{ borderRadius: 'var(--radius-lg)', flex: 2 }}
            disabled={(step === 1 && selectedPeople.length === 0) || (step === 2 && items.length === 0)}
            onClick={() => handleStepChange(step + 1)}
          >
            {step === 1 ? 'Items' : 'Review'} <ChevronRight size={20} className="inline ml-1" />
          </button>
        ) : (
          <button 
            className="btn btn-danger" 
            style={{ borderRadius: 'var(--radius-lg)', flex: 2 }}
            onClick={handleSave}
          >
            Save split <Check size={20} className="inline ml-1" />
          </button>
        )}
      </footer>

    </div>
  );
}
