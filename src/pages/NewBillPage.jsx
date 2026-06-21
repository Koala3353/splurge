import { useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAppContext } from '../store/AppContext';
import { formatCurrency, initialsOf } from '../utils/format';
import { computeBillDues } from '../utils/split';
import { parseReceipt } from '../utils/receipt';
import { flushSync } from 'react-dom';
import Navigation from '../components/Navigation';
import {
  Plus, Trash2, Check, Loader2, ChevronRight, ChevronLeft,
  Users, UserPlus, Sparkles, CheckCircle, X,
} from 'lucide-react';
import SwipeableItem from '../components/SwipeableItem';

const newItem = (people) => ({ id: crypto.randomUUID(), name: '', price: 0, people: [...people] });

// Prepare a captured photo for OCR: size it into a legible range, then convert
// to high-contrast grayscale (Tesseract reads clean monochrome far better than
// a raw phone photo of a receipt).
async function preprocessReceipt(file) {
  const img = new Image();
  img.src = URL.createObjectURL(file);
  await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });

  const TARGET = 1600; // longest side; balances legibility vs. mobile memory
  let { width, height } = img;
  const scale = TARGET / Math.max(width, height);
  if (scale < 0.95 || scale > 1.1) {
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, width, height);

  try {
    const imageData = ctx.getImageData(0, 0, width, height);
    const d = imageData.data;
    const contrast = 1.45;
    const intercept = 128 * (1 - contrast);
    for (let i = 0; i < d.length; i += 4) {
      let v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      v = v * contrast + intercept;
      d[i] = d[i + 1] = d[i + 2] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
    ctx.putImageData(imageData, 0, 0);
  } catch {
    // getImageData can throw on a tainted canvas; fall back to the plain draw.
  }

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
}

export default function NewBillPage() {
  const { people, groups, addPerson, addBill, updateBill, bills, meId, setMeId } = useAppContext();
  const navigate = useNavigate();
  const location = useLocation();
  const editId = location.state?.editId || null;
  // When editing, prefill straight from the stored bill (localStorage is read
  // synchronously, so it's available on first render — no effect needed).
  const editBill = editId ? bills.find((b) => b.id === editId) : null;

  const [step, setStep] = useState(editBill ? 2 : 1); // 1: People, 2: Items, 3: Review
  const [splitName, setSplitName] = useState(editBill?.title || '');
  const [selectedPeople, setSelectedPeople] = useState(editBill?.participants || []);
  const [newPersonName, setNewPersonName] = useState('');
  const [image, setImage] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrProgress, setOcrProgress] = useState('Loading scanner...');
  const [items, setItems] = useState(() => (editBill?.items || []).map((it) => ({ ...it, people: [...(it.people || [])] })));
  const [fees, setFees] = useState(() => (editBill?.fees || []).map((f) => ({
    ...f,
    people: f.people || [...(editBill?.participants || [])],
  })));
  const fileInputRef = useRef(null);
  const discardRef = useRef(null);

  const handleStepChange = (newStep) => {
    const direction = newStep > step ? 'forward' : 'backward';
    if (!document.startViewTransition) { setStep(newStep); return; }
    document.startViewTransition({
      update: () => { flushSync(() => setStep(newStep)); },
      types: [direction],
    });
  };

  const stepTitles = {
    1: { title: 'Who’s in?', subtitle: '1 of 3 · Pick everyone splitting this one.' },
    2: { title: 'What’d you get?', subtitle: '2 of 3 · Add each line, or scan the receipt.' },
    3: { title: 'Review', subtitle: '3 of 3 · Check the math, then save.' },
  };

  // --- STEP 1: People ---
  const handleGroupSelect = (groupId) => {
    const group = groups.find((g) => g.id === groupId);
    if (group) setSelectedPeople((prev) => Array.from(new Set([...prev, ...group.peopleIds])));
  };

  const togglePerson = (id) => {
    setSelectedPeople((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const handleAddPersonSubmit = (e) => {
    e.preventDefault();
    const name = newPersonName.trim();
    if (!name) return;
    const id = addPerson(name);
    setSelectedPeople((prev) => [...prev, id]);
    setNewPersonName('');
  };

  // Add (and remember) yourself, and tag you as "me" so your share never counts
  // as money owed to you.
  const handleAddMe = () => {
    if (meId) {
      const meExists = people.some((p) => p.id === meId);
      if (meExists) {
        setSelectedPeople((prev) => (prev.includes(meId) ? prev : [...prev, meId]));
        return;
      }
    }
    const existing = people.find((p) => ['me', 'you'].includes(p.name.trim().toLowerCase()));
    if (existing) {
      setMeId(existing.id);
      setSelectedPeople((prev) => (prev.includes(existing.id) ? prev : [...prev, existing.id]));
      return;
    }
    const id = addPerson('Me');
    setMeId(id);
    setSelectedPeople((prev) => [...prev, id]);
  };

  // --- STEP 2: Items & OCR ---
  const handleImageCapture = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImage(URL.createObjectURL(file));
    setIsProcessing(true);
    setOcrProgress('Optimizing image...');

    let worker;
    try {
      const blob = await preprocessReceipt(file);

      setOcrProgress('Initializing OCR...');
      // Lazy-load the OCR engine — its code is fetched only when someone
      // actually scans a receipt, keeping it out of the initial app bundle.
      const { createWorker } = await import('tesseract.js');
      worker = await createWorker('eng', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') setOcrProgress(`Reading text: ${Math.round(m.progress * 100)}%`);
          else setOcrProgress('Loading language data...');
        },
      });
      // PSM 4 = a single column of variable-size lines (a receipt). Keeping
      // inter-word spaces helps the parser separate item names from amounts.
      await worker.setParameters({ tessedit_pageseg_mode: '4', preserve_interword_spaces: '1' });

      const { data } = await worker.recognize(blob);
      const parsed = parseReceipt(data.text, selectedPeople);
      setItems(parsed.length > 0 ? parsed : [newItem(selectedPeople)]);
    } catch (error) {
      console.error('OCR failed', error);
      setItems([newItem(selectedPeople)]);
    } finally {
      if (worker) worker.terminate();
      setIsProcessing(false);
    }
  };

  const updateItem = (id, field, value) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, [field]: value } : it)));
  };

  const togglePersonForItem = (itemId, personId) => {
    setItems((prev) => prev.map((it) => {
      if (it.id !== itemId) return it;
      const has = it.people.includes(personId);
      return { ...it, people: has ? it.people.filter((p) => p !== personId) : [...it.people, personId] };
    }));
  };

  const toggleEveryoneForItem = (itemId) => {
    setItems((prev) => prev.map((it) => {
      if (it.id !== itemId) return it;
      const all = selectedPeople.every((p) => it.people.includes(p));
      return { ...it, people: all ? [] : [...selectedPeople] };
    }));
  };

  // --- STEP 3: Fees ---
  const addFee = () => setFees((prev) => [...prev, { id: crypto.randomUUID(), name: 'Service charge', amount: 0, people: [...selectedPeople] }]);
  const updateFee = (id, field, val) => setFees((prev) => prev.map((f) => (f.id === id ? { ...f, [field]: val } : f)));
  const removeFee = (id) => setFees((prev) => prev.filter((f) => f.id !== id));

  const togglePersonForFee = (feeId, personId) => {
    setFees((prev) => prev.map((f) => {
      if (f.id !== feeId) return f;
      const has = (f.people || []).includes(personId);
      return { ...f, people: has ? f.people.filter((p) => p !== personId) : [...(f.people || []), personId] };
    }));
  };

  const toggleEveryoneForFee = (feeId) => {
    setFees((prev) => prev.map((f) => {
      if (f.id !== feeId) return f;
      const all = selectedPeople.length > 0 && selectedPeople.every((p) => (f.people || []).includes(p));
      return { ...f, people: all ? [] : [...selectedPeople] };
    }));
  };

  // --- Derived totals (shared math) ---
  const draftBill = { items, fees, participants: selectedPeople };
  const { dues: calculatedDues, itemsTotal, feesTotal, total: finalTotal } = computeBillDues(draftBill);

  const handleSave = () => {
    const payload = {
      title: splitName,
      items,
      fees,
      total: finalTotal,
      participants: selectedPeople,
    };
    if (editId) updateBill(editId, payload);
    else addBill(payload);
    navigate('/');
  };

  const personName = (id) => people.find((p) => p.id === id)?.name || '';

  return (
    <div className="app-shell animate-slide-in">
      {/* HEADER */}
      <header className="app-header">
        <div className="flex justify-between items-center mb-4">
          <button
            className="btn p-2 pressable"
            style={{ borderRadius: '50%', background: 'var(--glass-bg)' }}
            onClick={() => (step > 1 ? handleStepChange(step - 1) : navigate('/'))}
            aria-label="Back"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="flex gap-3 items-center">
            <button
              className="btn p-2 text-danger pressable"
              style={{ background: 'rgba(244,63,94,0.1)', borderRadius: '50%' }}
              onClick={() => discardRef.current?.showModal()}
              aria-label="Discard split"
            >
              <Trash2 size={20} />
            </button>
            <div className="text-right">
              <div className="font-bold tabular-nums">{formatCurrency(finalTotal)}</div>
              <div className="text-xs text-secondary">total</div>
            </div>
          </div>
        </div>

        <h1 className="text-2xl font-bold mb-1">{stepTitles[step].title}</h1>
        <p className="text-sm text-secondary mb-3">{stepTitles[step].subtitle}</p>

        <div className="flex gap-1">
          {[1, 2, 3].map((s) => (
            <div key={s} style={{ flex: 1, height: '4px', borderRadius: '2px', background: s <= step ? 'var(--accent-color)' : 'var(--glass-bg)' }} />
          ))}
        </div>
      </header>

      <main className="app-main">
        {/* STEP 1 */}
        {step === 1 && (
          <>
            <div className="card">
              <div className="text-xs text-secondary font-bold uppercase mb-2 tracking-wider">Split name</div>
              <input
                type="text"
                className="input-ghost text-xl font-bold w-full"
                value={splitName}
                onChange={(e) => setSplitName(e.target.value)}
                placeholder="Friday dinner"
              />
            </div>

            {groups.length > 0 && (
              <div className="card">
                <h3 className="font-bold text-lg mb-1">Your crews</h3>
                <p className="text-sm text-secondary mb-4">Tap one to bring everyone in.</p>
                <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar">
                  {groups.map((g) => (
                    <button
                      key={g.id}
                      className="cursor-pointer pressable text-left"
                      style={{ background: 'rgba(16,185,129,0.1)', borderRadius: 'var(--radius-lg)', padding: '1rem', minWidth: '160px', border: 'none' }}
                      onClick={() => handleGroupSelect(g.id)}
                    >
                      <Users size={24} className="text-success mb-2" />
                      <h4 className="font-bold">{g.name}</h4>
                      <p className="text-xs text-secondary mt-1 truncate">
                        {g.peopleIds.map((id) => personName(id)).filter(Boolean).join(', ')}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="card">
              <h3 className="font-bold text-lg mb-4">People</h3>

              <form onSubmit={handleAddPersonSubmit} className="flex gap-2 mb-4">
                <div className="flex-1 flex items-center gap-2 border border-glass rounded-lg px-3 py-2">
                  <UserPlus size={18} className="text-secondary" />
                  <input type="text" className="input-ghost flex-1" placeholder="Name" value={newPersonName} onChange={(e) => setNewPersonName(e.target.value)} />
                </div>
                <button type="submit" className="btn bg-glass px-4 rounded-lg pressable" aria-label="Add person"><Plus size={20} /></button>
              </form>

              <button
                className="btn w-full flex items-center gap-2 mb-6 pressable"
                style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--text-primary)', padding: '1rem', borderRadius: 'var(--radius-lg)' }}
                onClick={handleAddMe}
              >
                <div className="bg-success text-bg rounded-full p-1"><Plus size={14} /></div>
                <span className="font-bold">Add me</span>
              </button>

              {people.length === 0 ? (
                <p className="text-sm text-secondary">Add yourself, then everyone else splitting the bill.</p>
              ) : (
                <>
                  <div className="text-xs text-secondary font-bold uppercase mb-2">Tap to add</div>
                  <div className="flex gap-2 flex-wrap">
                    {people.map((p) => {
                      const isSel = selectedPeople.includes(p.id);
                      return (
                        <button key={p.id} className={`pill ${isSel ? 'pill-active' : 'pill-inactive'} flex items-center gap-1`} onClick={() => togglePerson(p.id)}>
                          {isSel ? <Check size={14} /> : <Plus size={14} />} {p.name}{p.id === meId ? ' (you)' : ''}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <>
            {items.length === 0 && !isProcessing && (
              <div className="card text-center py-8">
                <h3 className="font-bold text-xl mb-2">What&apos;d everyone get?</h3>
                <p className="text-sm text-secondary mb-6">Snap the receipt and we&apos;ll pull out the lines, or add them yourself.</p>
                <input type="file" accept="image/*" capture="environment" ref={fileInputRef} onChange={handleImageCapture} style={{ display: 'none' }} />
                <div className="flex gap-4 justify-center">
                  <button className="btn btn-secondary flex-col items-center p-4 rounded-xl flex-1 pressable" onClick={() => setItems([newItem(selectedPeople)])}>
                    <Plus size={32} className="mb-2 text-primary" />
                    <span>Add manually</span>
                  </button>
                  <button className="btn flex-col items-center pressable" style={{ background: 'rgba(236,72,153,0.12)', color: 'var(--accent-color)', padding: '1rem', borderRadius: 'var(--radius-lg)', flex: 1 }} onClick={() => fileInputRef.current?.click()}>
                    <Sparkles size={32} className="mb-2" />
                    <span>Scan receipt</span>
                  </button>
                </div>
              </div>
            )}

            {isProcessing && (
              <div className="scanner-overlay animate-slide-in">
                <h2 className="text-3xl font-black mb-2 text-center text-accent">Reading the receipt</h2>
                <p className="text-secondary text-center mb-8">Pulling out the line items — one sec.</p>
                <div className="scanner-laser-container">
                  <div className="scanner-laser" />
                  {image
                    ? <img src={image} className="scanner-image" alt="Receipt being scanned" />
                    : <div className="w-full h-full bg-glass flex items-center justify-center"><Loader2 size={40} className="animate-spin text-secondary" /></div>}
                </div>
                <div className="card border-glass p-4 text-center bg-glass flex flex-col items-center gap-3" style={{ width: '100%', maxWidth: '320px' }}>
                  <Loader2 size={24} className="animate-spin text-accent" />
                  <p className="font-bold tracking-wider uppercase text-sm text-primary">{ocrProgress}</p>
                </div>
              </div>
            )}

            {!isProcessing && items.length > 0 && (
              <div className="flex-col gap-4">
                <div className="flex justify-between items-center mb-2 px-2">
                  <span className="text-sm text-secondary font-bold uppercase">Subtotal</span>
                  <span className="font-bold tabular-nums">{formatCurrency(itemsTotal)}</span>
                </div>

                <ul className="SwipeableList">
                  {items.map((item) => {
                    const everyone = selectedPeople.length > 0 && selectedPeople.every((p) => item.people.includes(p));
                    return (
                      <SwipeableItem key={item.id} onDelete={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}>
                        <div className="card p-0 overflow-hidden" style={{ padding: 0, marginBottom: 0 }}>
                          <div className="flex justify-between items-center p-4 border-b border-glass">
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className="text-success flex-shrink-0"><CheckCircle size={24} /></div>
                              <input type="text" className="input-ghost text-lg font-bold w-full" placeholder="Item name" value={item.name} onChange={(e) => updateItem(item.id, 'name', e.target.value)} />
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-sm text-secondary font-medium">₱</span>
                              <input type="number" inputMode="decimal" step="0.01" className="input-ghost text-xl font-bold text-right" style={{ width: '84px' }} value={item.price || ''} onChange={(e) => updateItem(item.id, 'price', parseFloat(e.target.value) || 0)} />
                            </div>
                          </div>

                          <div className="p-3 bg-glass">
                            <div className="text-xs text-secondary font-bold uppercase tracking-wider mb-2 px-1">Shared by</div>
                            <div className="flex gap-2 overflow-x-auto pb-1 px-1 custom-scrollbar">
                              <button
                                className={`pill whitespace-nowrap flex items-center gap-1 flex-shrink-0 ${everyone ? 'pill-active' : 'pill-inactive'}`}
                                onClick={() => toggleEveryoneForItem(item.id)}
                                style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                              >
                                <Users size={14} /> Everyone
                              </button>
                              {selectedPeople.map((pId) => {
                                const isSel = item.people.includes(pId);
                                return (
                                  <button
                                    key={pId}
                                    className={`pill whitespace-nowrap flex items-center gap-1 flex-shrink-0 ${isSel ? 'pill-active' : 'pill-inactive'}`}
                                    onClick={() => togglePersonForItem(item.id, pId)}
                                    style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                                  >
                                    {isSel ? <Check size={14} /> : <Plus size={14} />} {personName(pId)}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </SwipeableItem>
                    );
                  })}
                </ul>

                <button className="card text-center cursor-pointer mb-6 border-dashed pressable" style={{ width: '100%' }} onClick={() => setItems((prev) => [...prev, newItem(selectedPeople)])}>
                  <Plus size={20} className="inline mr-2" /> Add another item
                </button>
              </div>
            )}
          </>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <>
            <div className="card mb-6 p-0" style={{ padding: 0 }}>
              <div className="p-4 border-b border-glass flex justify-between items-center cursor-pointer pressable" onClick={addFee}>
                <div className="flex items-center gap-3">
                  <div style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)', padding: '0.5rem', borderRadius: '50%' }}><Plus size={20} /></div>
                  <div>
                    <h3 className="font-bold text-lg">Fees &amp; tips</h3>
                    <p className="text-sm text-secondary">Catch service charge or discounts before you send.</p>
                  </div>
                </div>
                <div className="font-bold tabular-nums">{formatCurrency(feesTotal)}</div>
              </div>

              {fees.length > 0 && (
                <ul className="SwipeableList p-4">
                  {fees.map((fee) => (
                    <SwipeableItem key={fee.id} onDelete={() => removeFee(fee.id)}>
                      <div className="flex-col gap-3 p-4 bg-glass border border-glass rounded-lg">
                        <div className="text-xs text-secondary font-bold uppercase tracking-wider">Name</div>
                        <input type="text" className="input-ghost text-lg font-bold w-full border-b border-glass pb-2" value={fee.name} onChange={(e) => updateFee(fee.id, 'name', e.target.value)} />
                        <div className="text-xs text-secondary font-bold uppercase tracking-wider mt-2">Amount <span className="lowercase font-medium">(minus for a discount)</span></div>
                        <div className="flex gap-2 items-center">
                          <span className="text-secondary font-medium">₱</span>
                          <input type="number" inputMode="decimal" step="0.01" className="input-ghost text-xl font-bold flex-1" value={fee.amount || ''} onChange={(e) => updateFee(fee.id, 'amount', parseFloat(e.target.value) || 0)} />
                        </div>

                        <div className="text-xs text-secondary font-bold uppercase tracking-wider mt-2">Applies to</div>
                        <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                          {(() => {
                            const everyone = selectedPeople.length > 0 && selectedPeople.every((p) => (fee.people || []).includes(p));
                            return (
                              <button
                                className={`pill whitespace-nowrap flex items-center gap-1 flex-shrink-0 ${everyone ? 'pill-active' : 'pill-inactive'}`}
                                onClick={() => toggleEveryoneForFee(fee.id)}
                                style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                              >
                                <Users size={14} /> Everyone
                              </button>
                            );
                          })()}
                          {selectedPeople.map((pId) => {
                            const isSel = (fee.people || []).includes(pId);
                            return (
                              <button
                                key={pId}
                                className={`pill whitespace-nowrap flex items-center gap-1 flex-shrink-0 ${isSel ? 'pill-active' : 'pill-inactive'}`}
                                onClick={() => togglePersonForFee(fee.id, pId)}
                                style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                              >
                                {isSel ? <Check size={14} /> : <Plus size={14} />} {personName(pId)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </SwipeableItem>
                  ))}
                  <button className="btn btn-secondary w-full mt-2" style={{ borderRadius: 'var(--radius-lg)' }} onClick={addFee}>+ Add another</button>
                </ul>
              )}
            </div>

            <div className="card p-0 overflow-hidden" style={{ padding: 0 }}>
              <div className="p-4 border-b border-glass">
                <p className="text-sm text-secondary mb-1">Final total</p>
                <h2 className="text-4xl font-black break-words">{formatCurrency(finalTotal)}</h2>
              </div>

              <div className="p-4 border-b border-glass">
                <div className="flex justify-between text-sm text-secondary mb-2">
                  <span>Items</span><span className="tabular-nums">{formatCurrency(itemsTotal)}</span>
                </div>
                <div className="flex justify-between text-sm text-secondary">
                  <span>Adjustments</span><span className="tabular-nums">{formatCurrency(feesTotal)}</span>
                </div>
              </div>

              <div className="p-4">
                <div className="text-xs text-secondary font-bold uppercase tracking-wider mb-3">The split</div>
                <div className="flex-col gap-2">
                  {selectedPeople.map((pId) => (
                    <div key={pId} className="flex justify-between items-center py-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="avatar bg-accent flex-shrink-0">{initialsOf(personName(pId))}</div>
                        <div className="font-bold truncate">{personName(pId)}{pId === meId ? ' (you)' : ''}</div>
                      </div>
                      <div className="font-bold text-lg tabular-nums flex-shrink-0">{formatCurrency(calculatedDues[pId] || 0)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      {/* ACTION BUTTONS */}
      <div className="p-4 bg-glass flex gap-4" style={{ flexShrink: 0, zIndex: 10, borderTop: '1px solid var(--glass-border)' }}>
        {step > 1 && (
          <button className="btn btn-secondary flex-1 pressable" style={{ borderRadius: 'var(--radius-lg)' }} onClick={() => handleStepChange(step - 1)}>
            <ChevronLeft size={20} className="inline mr-1" /> Back
          </button>
        )}
        {step < 3 ? (
          <button
            className="btn btn-primary pressable"
            style={{ borderRadius: 'var(--radius-lg)', flex: 2 }}
            disabled={(step === 1 && selectedPeople.length === 0) || (step === 2 && items.length === 0)}
            onClick={() => handleStepChange(step + 1)}
          >
            {step === 1 ? 'Next: items' : 'Next: review'} <ChevronRight size={20} className="inline ml-1" />
          </button>
        ) : (
          <button className="btn btn-primary pressable" style={{ borderRadius: 'var(--radius-lg)', flex: 2 }} onClick={handleSave}>
            {editId ? 'Save changes' : 'Save split'} <Check size={20} className="inline ml-1" />
          </button>
        )}
      </div>

      {/* Discard confirm */}
      <dialog ref={discardRef}>
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-xl font-bold">Discard this split?</h2>
          <form method="dialog"><button className="text-secondary" aria-label="Close"><X size={20} /></button></form>
        </div>
        <p className="text-sm text-secondary mb-4">Your changes won&apos;t be saved.</p>
        <div className="flex gap-2 justify-end">
          <button type="button" className="btn btn-secondary" onClick={() => discardRef.current?.close()}>Keep editing</button>
          <button type="button" className="btn btn-danger" onClick={() => { discardRef.current?.close(); navigate('/'); }}>Discard</button>
        </div>
      </dialog>

      <Navigation />
    </div>
  );
}
