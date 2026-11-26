import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useAppContext } from '../store/AppContext';
import { formatCurrency, formatRelativeDate } from '../utils/format';
import { computeBillDues, fromCents, toCents } from '../utils/split';
import { uid } from '../utils/id';
import { parseReceiptFull } from '../utils/receipt';
import { warmUpOcr, scanReceipt, cancelScan, ScanAbortedError } from '../utils/ocr';
import Button from '../components/ui/Button.jsx';
import Sheet from '../components/ui/Sheet.jsx';
import StepPeople from '../components/newbill/StepPeople.jsx';
import StepItems from '../components/newbill/StepItems.jsx';
import StepReview from '../components/newbill/StepReview.jsx';
import EvenSplitSheet from '../components/newbill/EvenSplitSheet.jsx';
import SavedSheet from '../components/newbill/SavedSheet.jsx';
import ScanResultDialog from '../components/ScanResultDialog';
import NewGroupForm from '../components/people/NewGroupForm.jsx';
import RepeatStrip from '../components/newbill/RepeatStrip.jsx';
import UsualBanner from '../components/newbill/UsualBanner.jsx';
import { rankPeopleBySplits } from '../utils/suggestions';
import '../components/shell.css';
import '../components/newbill/newbill.css';

const STEPS = {
  1: {
    title: 'Who is splitting this?',
    lede: 'Step 1 of 3. Pick the people, or split one amount evenly and be done.',
  },
  2: {
    title: 'What was on it?',
    lede: 'Step 2 of 3. Scan the receipt or type the lines, then say who is on each.',
  },
  3: {
    title: 'Check it over',
    lede: 'Step 3 of 3. Add anything on top, then save and send.',
  },
};

const newLine = (people) => ({ id: uid(), name: '', price: 0, people: [...people] });

/**
 * Turn a saved bill into a fresh draft of the same split.
 *
 * Prefill semantics, decided once and documented here:
 *
 *  - **Prices come through filled in, not blanked.** The same order rarely
 *    costs exactly the same, but it almost never changes class: ₱345.50
 *    becomes ₱352, not ₱40. A filled figure is one you correct where it moved
 *    and leave where it didn't; a blank is six mandatory entries, which costs
 *    more than the wizard this is meant to replace. The running total sits in
 *    the header throughout, so a stale price is on screen rather than hidden,
 *    and the note on step 2 says plainly that the figures are last time's.
 *  - **Line names and per-line assignments come through too**, because they
 *    are the expensive part — the audit measured assignment at 40% of the
 *    taps in the flow — and they are exactly what a single even amount can
 *    never carry.
 *  - **People deleted since are scrubbed**, from the crew and from every line
 *    they were on. A line that loses its last assignee is left empty on
 *    purpose rather than quietly handed to the rest: step 2's gate names it
 *    and refuses to advance, so the money is visibly unallocated instead of
 *    silently moved onto somebody else's share.
 *  - **Nothing is shared with the original.** New line ids, new fee ids, and
 *    the draft stays in the wizard until it is saved, so a repeat abandoned
 *    halfway writes nothing at all.
 */
function draftFrom(bill, knownIds) {
  const crew = (bill.participants || []).filter((id) => knownIds.has(id));
  const onCrew = (ids) => (ids || []).filter((id) => crew.includes(id));
  return {
    crew,
    title: bill.title || '',
    items: (bill.items || []).map((it) => ({
      ...it, id: uid(), people: onCrew(it.people),
    })),
    fees: (bill.fees || [])
      .filter((f) => !f.tipPct)
      .map((f) => ({
        ...f, id: uid(), people: onCrew(f.people || bill.participants),
      })),
    tipPct: (bill.fees || []).find((f) => f.tipPct > 0)?.tipPct || 0,
    lostSomeone: crew.length !== (bill.participants || []).length,
  };
}

export default function NewBillPage() {
  const {
    people, groups, addPerson, addBill, updateBill, bills, meId, setMeId,
    usualCrew, lastTipPct, setLastTipPct,
  } = useAppContext();
  const navigate = useNavigate();
  const location = useLocation();

  const [params] = useSearchParams();

  const editId = location.state?.editId || null;
  const editBill = editId ? bills.find((b) => b.id === editId) : null;
  const preset = location.state?.peopleIds || null;
  const presetName = location.state?.presetName || '';

  /* ------------------------------------------------------------- repeat */
  // `?from=<billId>` opens the wizard on a *new* split hydrated from an old
  // one. Nothing is written to the store until save, so an abandoned repeat
  // leaves no trace — which is why this lives here rather than behind a
  // store action.
  const repeatId = params.get('from');
  const repeatBill = repeatId && !editId ? bills.find((b) => b.id === repeatId) : null;
  const known = useMemo(() => new Set(people.map((p) => p.id)), [people]);
  const [draft] = useState(() => (repeatBill ? draftFrom(repeatBill, known) : null));

  // A tip is stored as an ordinary fee carrying the percentage it came from,
  // so reopening a bill restores the control rather than a mystery amount.
  const storedTip = (editBill?.fees || []).find((f) => f.tipPct > 0);

  const [step, setStep] = useState(editBill || draft || preset ? 2 : 1);
  const [splitName, setSplitName] = useState(
    editBill?.title || draft?.title || presetName,
  );
  // The usual crew is the LAST fallback, so it can never override an edit, a
  // repeat or a group tapped on the way in — those are all explicit choices
  // about who is on this particular split.
  const [selected, setSelected] = useState(
    editBill?.participants || draft?.crew || preset || usualCrew.ids,
  );

  // Whether the usual crew is still the reason these people are selected. It
  // starts true only when nothing more specific chose them, and the banner
  // follows it rather than re-deriving a guess from the selection.
  const [usualApplied, setUsualApplied] = useState(
    () => !editBill && !draft && !preset && usualCrew.ids.length > 0,
  );

  const dropUsual = () => {
    setSelected((prev) => prev.filter((id) => !usualCrew.ids.includes(id)));
    setUsualApplied(false);
  };
  const [items, setItems] = useState(
    () => draft?.items
      || (editBill?.items || []).map((it) => ({ ...it, people: [...(it.people || [])] })),
  );
  const [fees, setFees] = useState(
    () => draft?.fees
      || (editBill?.fees || [])
        .filter((f) => !f.tipPct)
        .map((f) => ({ ...f, people: f.people || [...(editBill?.participants || [])] })),
  );
  // A tip is a habit, not a decision you remake from zero every time: the
  // percentage you left last time is the default for the next bill. An edit
  // keeps the bill's own tip (or its deliberate absence), and a repeat keeps
  // the one it is repeating — both are explicit, and neither is overridden.
  const [tipPct, setTipPct] = useState(() => {
    if (editBill) return storedTip?.tipPct || 0;
    if (draft) return draft.tipPct;
    return lastTipPct || 0;
  });

  // The bill this draft is a repeat of, whether it arrived by URL or by a tap
  // on step 1. It drives the note on step 2 and nothing else.
  const [repeatedFrom, setRepeatedFrom] = useState(
    () => (repeatBill ? { id: repeatBill.id, lostSomeone: draft.lostSomeone } : null),
  );
  const repeatSource = repeatedFrom ? bills.find((b) => b.id === repeatedFrom.id) : null;

  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState('');
  const [scanStep, setScanStep] = useState(null);
  const [scanShot, setScanShot] = useState(null);
  const [scanInfo, setScanInfo] = useState(null);
  const [scanNote, setScanNote] = useState('');
  const [scanCancelling, setScanCancelling] = useState(false);
  const [scanResultOpen, setScanResultOpen] = useState(false);

  const [evenOpen, setEvenOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [saved, setSaved] = useState(null);
  const [printing, setPrinting] = useState(false);

  const cameraRef = useRef(null);
  const libraryRef = useRef(null);
  const lastSource = useRef('camera');
  const printedOnce = useRef(false);
  const shotUrl = useRef(null);

  // A scan still running when the wizard leaves is a worker burning the
  // phone's battery for an answer nobody will read.
  useEffect(() => () => {
    cancelScan();
    if (shotUrl.current) URL.revokeObjectURL(shotUrl.current);
  }, []);

  const nameOf = (id) => people.find((p) => p.id === id)?.name || 'Someone';

  // The picker, ordered by who you actually split with. Sorted here rather
  // than in the store because this is the only screen the order is for — and
  // it is a plain count, so it holds still between visits.
  const pickerPeople = useMemo(
    () => rankPeopleBySplits({ people, bills }),
    [people, bills],
  );

  /* ---------------------------------------------------------------- math */
  // Two passes: the items alone fix the subtotal a percentage tip is a
  // percentage OF, and the full pass then splits items, fees and that tip.
  // The list always carries one blank line at the end, the way a form that
  // grows does; it is not part of the bill until it says something.
  const realItems = useMemo(
    () => items.filter((it) => it.name.trim() || it.price > 0),
    [items],
  );

  const { itemsTotal } = useMemo(
    () => computeBillDues({ items: realItems, fees: [], participants: selected }),
    [realItems, selected],
  );

  const tipAmount = useMemo(
    () => (tipPct > 0 ? fromCents(Math.round((toCents(itemsTotal) * tipPct) / 100)) : 0),
    [itemsTotal, tipPct],
  );

  const allFees = useMemo(() => (
    tipPct > 0
      ? [...fees, {
        id: 'tip', name: `Tip (${tipPct}%)`, amount: tipAmount, people: [...selected], tipPct,
      }]
      : fees
  ), [fees, tipPct, tipAmount, selected]);

  const {
    dues, total, unassigned,
  } = useMemo(
    () => computeBillDues({ items: realItems, fees: allFees, participants: selected }, { meId }),
    [realItems, allFees, selected, meId],
  );

  const unassignedNames = unassigned.map((it) => it.name.trim() || 'an untitled line');
  const assignedCount = realItems.filter((it) => it.people.length > 0).length;
  // Is the usual crew still exactly who is on this split, untouched? That is
  // what "the user hasn't done anything yet" means once a default exists —
  // without it, a pre-selected partner would make a brand-new wizard look
  // dirty, hide the "same as last time" strip, and pop a discard dialog on
  // the way back out of a split nobody had started.
  const untouchedUsual = usualApplied
    && selected.length === usualCrew.ids.length
    && usualCrew.ids.every((id) => selected.includes(id));

  // The banner survives adding somebody else — the usual crew is still the
  // reason those people are on it — but not taking one of them off.
  const usualShowing = usualApplied && usualCrew.ids.length > 0
    && usualCrew.ids.every((id) => selected.includes(id));

  const dirty = items.length > 0
    || splitName.trim().length > 0
    || (selected.length > 0 && !untouchedUsual);

  /* -------------------------------------------------------------- step 1 */
  const togglePerson = (id) => setSelected(
    (prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]),
  );

  const addGroupPeople = (ids) => setSelected(
    (prev) => Array.from(new Set([...prev, ...ids])),
  );

  const addNewPerson = (name) => {
    const id = addPerson(name);
    setSelected((prev) => [...prev, id]);
  };

  // Tagging yourself here is what keeps you out of your own invoice.
  const addMe = () => {
    if (meId && people.some((p) => p.id === meId)) {
      setSelected((prev) => (prev.includes(meId) ? prev : [...prev, meId]));
      return;
    }
    const existing = people.find((p) => ['me', 'you'].includes(p.name.trim().toLowerCase()));
    const id = existing ? existing.id : addPerson('Me');
    setMeId(id);
    setSelected((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

  /* -------------------------------------------------------------- step 2 */
  const openPicker = (source = 'camera') => {
    lastSource.current = source;
    warmUpOcr().catch(() => {});
    (source === 'library' ? libraryRef : cameraRef).current?.click();
  };

  const rescan = () => openPicker(lastSource.current);

  // The engine can only let go between passes, so the control reports that it
  // has been heard rather than sitting there looking broken.
  const stopScan = () => {
    setScanCancelling(true);
    cancelScan();
  };

  const readReceipt = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (shotUrl.current) URL.revokeObjectURL(shotUrl.current);
    shotUrl.current = URL.createObjectURL(file);
    setScanShot(shotUrl.current);
    setScanNote('');
    setScanInfo(null);
    setScanStep(null);
    setScanMessage('Optimising the photo…');
    setScanCancelling(false);
    setScanning(true);

    try {
      const { text, diagnostics } = await scanReceipt(file, (message, progress) => {
        setScanMessage(message);
        setScanStep(progress || null);
      });
      const { items: parsed, fees: parsedFees } = parseReceiptFull(text, selected);
      setScanInfo({
        ...diagnostics, itemCount: parsed.length, feeCount: parsedFees.length, text,
      });
      setScanResultOpen(true);

      if (parsed.length > 0) {
        setItems(parsed);
        if (parsedFees.length > 0) {
          setFees(parsedFees.map((f) => ({ ...f, people: f.people || [...selected] })));
          setScanNote(
            `It also caught ${parsedFees.map((f) => f.name).join(', ')}. Those are on the next step — put any discount on whoever earned it.`,
          );
        }
      } else {
        setScanNote('No lines came out of that photo. A flatter, better-lit shot usually beats typing, but typing always works.');
      }
    } catch (error) {
      if (error instanceof ScanAbortedError && error.cancelled) {
        setScanNote('Scan cancelled. Nothing changed — whatever you had typed is still here.');
      } else if (error instanceof ScanAbortedError && error.timedOut) {
        setScanNote('The scan ran past 45 seconds and stopped itself. Try a flatter, brighter photo, or type the lines in.');
      } else {
        setScanNote('The scanner could not run on that photo. Try a different shot, or type the lines in.');
      }
    } finally {
      setScanning(false);
      setScanCancelling(false);
      setScanStep(null);
    }
  };

  // Naming the last line opens the next one, so six lines cost six entries
  // rather than six entries and five taps on "Add a line".
  const setItemField = (id, field, value) => setItems((prev) => {
    const next = prev.map((it) => (it.id === id ? { ...it, [field]: value } : it));
    const last = next[next.length - 1];
    const started = last && (last.name.trim() || last.price > 0);
    return last?.id === id && started ? [...next, newLine(selected)] : next;
  });

  const toggleItemPerson = (itemId, personId) => setItems((prev) => prev.map((it) => {
    if (it.id !== itemId) return it;
    return {
      ...it,
      people: it.people.includes(personId)
        ? it.people.filter((p) => p !== personId)
        : [...it.people, personId],
    };
  }));

  const everyoneOnItem = (itemId) => setItems((prev) => prev.map((it) => {
    if (it.id !== itemId) return it;
    const all = selected.length > 0 && selected.every((p) => it.people.includes(p));
    return { ...it, people: all ? [] : [...selected] };
  }));

  const copyAssignment = (itemId, peopleIds) => setItems(
    (prev) => prev.map((it) => (it.id === itemId ? { ...it, people: [...peopleIds] } : it)),
  );

  // One person, every line, one tap — the accelerator the old grid had no
  // equivalent of at all.
  const personColumn = (personId, on) => setItems((prev) => prev.map((it) => ({
    ...it,
    people: on
      ? Array.from(new Set([...it.people, personId]))
      : it.people.filter((p) => p !== personId),
  })));

  /* -------------------------------------------------------------- step 3 */
  const addFee = () => setFees((prev) => [...prev, {
    id: uid(), name: 'Service charge', amount: 0, people: [...selected],
  }]);

  const setFeeField = (id, field, value) => setFees(
    (prev) => prev.map((f) => (f.id === id ? { ...f, [field]: value } : f)),
  );

  const removeFee = (id) => setFees((prev) => prev.filter((f) => f.id !== id));

  const toggleFeePerson = (feeId, personId) => setFees((prev) => prev.map((f) => {
    if (f.id !== feeId) return f;
    const on = (f.people || []).includes(personId);
    return {
      ...f,
      people: on ? f.people.filter((p) => p !== personId) : [...(f.people || []), personId],
    };
  }));

  const everyoneOnFee = (feeId) => setFees((prev) => prev.map((f) => {
    if (f.id !== feeId) return f;
    const all = selected.length > 0 && selected.every((p) => (f.people || []).includes(p));
    return { ...f, people: all ? [] : [...selected] };
  }));

  /* ------------------------------------------------------------ movement */
  const goTo = (next) => {
    if (next === 3) {
      setPrinting(!printedOnce.current);
      printedOnce.current = true;
    }
    setStep(next);
    window.scrollTo({ top: 0 });
  };

  // Step 1's "same as last time". It fills the draft in place rather than
  // navigating, because the wizard is already the screen you are standing on.
  const repeatFrom = (billId) => {
    const source = bills.find((b) => b.id === billId);
    if (!source) return;
    const next = draftFrom(source, known);
    setSplitName(next.title);
    setSelected(next.crew);
    setItems(next.items);
    setFees(next.fees);
    setTipPct(next.tipPct);
    setRepeatedFrom({ id: source.id, lostSomeone: next.lostSomeone });
    setUsualApplied(false);
    goTo(2);
  };

  const back = () => {
    if (step > 1) goTo(step - 1);
    else if (dirty) setDiscardOpen(true);
    else navigate('/');
  };

  const save = () => {
    const payload = {
      title: splitName, items: realItems, fees: allFees, total, participants: selected,
    };
    if (editId) updateBill(editId, payload);
    else addBill(payload);
    // Remembered only on a save, so an abandoned draft never moves the
    // default for the next bill.
    setLastTipPct(tipPct);
    setSaved({ dues, participants: selected, title: splitName });
  };

  const saveEvenSplit = (amount) => {
    const line = {
      id: uid(), name: splitName.trim() || 'Split evenly', price: amount, people: [...selected],
    };
    const bill = {
      title: splitName, items: [line], fees: [], participants: selected,
    };
    const { dues: evenDues, total: evenTotal } = computeBillDues(bill, { meId });
    addBill({ ...bill, total: evenTotal });
    setEvenOpen(false);
    setSaved({ dues: evenDues, participants: selected, title: splitName });
  };

  const blocked = (step === 1 && selected.length === 0)
    || (step === 2 && (realItems.length === 0 || unassigned.length > 0));

  return (
    <>
      <header className="wizard__head">
        <div className="column">
          <div className="wizard__top">
            <button type="button" className="icon-btn" onClick={back}>
              <ChevronLeft size={24} strokeWidth={1.5} aria-hidden="true" />
              <span className="u-sr-only">{step > 1 ? 'Back a step' : 'Leave this split'}</span>
            </button>
            <div className="wizard__running">
              <span className="figure">{formatCurrency(total)}</span>
              <span className="u-micro u-ink-3" style={{ display: 'block' }}>
                Running total
              </span>
            </div>
          </div>

          <h1 className="wizard__title">{STEPS[step].title}</h1>
          <p className="wizard__lede">{STEPS[step].lede}</p>

          <div className="wizard__ticks" aria-hidden="true">
            {[1, 2, 3].map((s) => (
              <span key={s} className={`wizard__tick${s <= step ? ' wizard__tick--done' : ''}`} />
            ))}
          </div>
        </div>
      </header>

      <main className="app__main">
        <div className="column">
          {/* Always mounted, so a rescan works once lines exist too. Two
              inputs because `capture` is what hands straight to the camera,
              and its absence is what lets the OS offer the photo library. */}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            ref={cameraRef}
            onChange={readReceipt}
            className="u-sr-only"
            tabIndex={-1}
            aria-hidden="true"
          />
          <input
            type="file"
            accept="image/*"
            ref={libraryRef}
            onChange={readReceipt}
            className="u-sr-only"
            tabIndex={-1}
            aria-hidden="true"
          />

          {scanNote && step === 2 && !scanning ? (
            <p className="notice" role="status">{scanNote}</p>
          ) : null}

          {/* Says out loud that the figures are last time's, so a price that
              moved is corrected rather than trusted. */}
          {repeatSource && step === 2 && !scanning ? (
            <section className="notice">
              <h2 className="notice__title">
                Repeated from {formatRelativeDate(repeatSource.date)}
              </h2>
              <p className="notice__body">
                The lines, the prices and who was on each are last time&rsquo;s.
                Change the ones that moved — the running total above follows
                along.
                {repeatedFrom.lostSomeone
                  ? ' Someone on that split has been deleted since, so the lines they were on are now on nobody. Put someone on each, or take the line off.'
                  : ''}
              </p>
            </section>
          ) : null}

          {step === 1 ? (
            <RepeatStrip
              fresh={!dirty}
              onRepeat={repeatFrom}
            />
          ) : null}

          {step === 1 && usualShowing ? (
            <UsualBanner
              label={usualCrew.label}
              count={usualCrew.ids.length}
              onClear={dropUsual}
            />
          ) : null}

          {step === 1 ? (
            <StepPeople
              people={pickerPeople}
              groups={groups}
              meId={meId}
              splitName={splitName}
              onName={setSplitName}
              selected={selected}
              onToggle={togglePerson}
              onAddGroupPeople={addGroupPeople}
              onAddPerson={addNewPerson}
              onAddMe={addMe}
              onNewGroup={() => setGroupOpen(true)}
              onEvenSplit={() => setEvenOpen(true)}
            />
          ) : null}

          {step === 2 ? (
            <StepItems
              items={items}
              realCount={realItems.length}
              participants={selected}
              nameOf={nameOf}
              itemsTotal={itemsTotal}
              assignedCount={assignedCount}
              scanning={scanning}
              scanShot={scanShot}
              scanMessage={scanMessage}
              scanStep={scanStep}
              scanCancelling={scanCancelling}
              scanInfo={scanInfo}
              onScan={openPicker}
              onRescan={rescan}
              onCancelScan={stopScan}
              onItemField={setItemField}
              onRemoveItem={(id) => setItems((prev) => prev.filter((it) => it.id !== id))}
              onAddItem={() => setItems((prev) => [...prev, newLine(selected)])}
              onToggle={toggleItemPerson}
              onEveryone={everyoneOnItem}
              onCopyAssignment={copyAssignment}
              onPersonColumn={personColumn}
            />
          ) : null}

          {step === 3 ? (
            <StepReview
              printing={printing}
              items={realItems}
              fees={fees}
              tipPct={tipPct}
              tipAmount={tipAmount}
              participants={selected}
              nameOf={nameOf}
              meId={meId}
              dues={dues}
              itemsTotal={itemsTotal}
              total={total}
              onFeeField={setFeeField}
              onAddFee={addFee}
              onRemoveFee={removeFee}
              onToggleFee={toggleFeePerson}
              onEveryoneFee={everyoneOnFee}
              onTipPct={setTipPct}
            />
          ) : null}
        </div>
      </main>

      {/* The gate. An item nobody is on counts toward the total and toward
          nobody's dues, so the split silently stops adding up — it is named
          and the step refuses to advance rather than saving quietly wrong. */}
      <div className="wizard__foot">
        {step === 2 && unassignedNames.length > 0 ? (
          <div className="column">
            <div className="notice wizard__gate" role="status">
              <p className="notice__title">Nobody is on {unassignedNames.join(', ')}</p>
              <p className="notice__body">
                Their money would vanish out of the split. Put someone on each,
                or take the line off.
              </p>
            </div>
          </div>
        ) : null}

        <div className="wizard__bar">
          {step > 1 ? <Button onClick={() => goTo(step - 1)}>Back</Button> : null}
          {step < 3 ? (
            <Button variant="solid" disabled={blocked} onClick={() => goTo(step + 1)}>
              {step === 1 ? 'Next: the lines' : 'Next: check it'}
            </Button>
          ) : (
            <Button variant="solid" onClick={save}>
              {editId ? 'Save the changes' : 'Save the split'}
            </Button>
          )}
        </div>
      </div>

      <ScanResultDialog
        open={scanResultOpen}
        info={scanInfo}
        onClose={() => setScanResultOpen(false)}
        onRescan={() => { setScanResultOpen(false); rescan(); }}
      />

      <EvenSplitSheet
        open={evenOpen}
        onClose={() => setEvenOpen(false)}
        title={splitName}
        participants={selected}
        nameOf={nameOf}
        meId={meId}
        onSave={saveEvenSplit}
      />

      <NewGroupForm open={groupOpen} onClose={() => setGroupOpen(false)} />

      <SavedSheet
        open={!!saved}
        title={saved?.title || ''}
        participants={saved?.participants || []}
        dues={saved?.dues || {}}
        nameOf={nameOf}
        meId={meId}
        onDone={() => navigate('/')}
      />

      <Sheet
        open={discardOpen}
        title="Leave this split?"
        size="sm"
        onClose={() => setDiscardOpen(false)}
        footer={
          <>
            <Button onClick={() => setDiscardOpen(false)}>Keep going</Button>
            <Button variant="danger" onClick={() => navigate('/')}>
              Throw it away
            </Button>
          </>
        }
      >
        <p className="u-ink-2">
          Nothing here is saved yet, and leaving drops the lines and the people
          you picked.
        </p>
      </Sheet>
    </>
  );
}
