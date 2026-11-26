/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo, useCallback, useEffect } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { configureCurrency, DEFAULT_CURRENCY } from '../utils/format';
import { SETTLED_EPSILON, toCents, fromCents, withDerivedTotal } from '../utils/split';
import { computeSettlement, paymentsWithoutBill } from '../utils/settlement';
import {
  removePersonFrom, restorePersonTo, removeGroupFrom, restoreGroupTo, needsSelfIdentity as needsSelf,
} from '../utils/roster';
import { uid } from '../utils/id';
import { readBackupExtras, resolveUsual } from '../utils/suggestions';
import { pruneNudges, recordNudges } from '../utils/nudges';
import {
  DEFAULT_SHARE_OPTIONS,
  buildPersonRequest,
  buildGroupReminder,
} from '../utils/shareText';

const AppContext = createContext(null);

const CURRENCY_KEY = 'split-currency';

/**
 * Applied at module scope, not in an effect.
 *
 * Every amount on screen is formatted during the very first render, and an
 * effect runs after the browser has painted — so configuring the currency
 * there would print a screen of pesos and then repaint it in euros. That
 * flash is the bug this setting has to avoid, and the only way to avoid it is
 * to read the stored code before React renders anything at all.
 *
 * Anything unreadable — private mode, a cleared key, a backup written before
 * this setting existed — resolves to the default inside configureCurrency.
 */
function storedCurrency() {
  if (typeof window === 'undefined') return DEFAULT_CURRENCY;
  try {
    const raw = window.localStorage.getItem(CURRENCY_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_CURRENCY;
  } catch {
    return DEFAULT_CURRENCY;
  }
}

configureCurrency(storedCurrency());

export function AppProvider({ children }) {
  // People: { id, name }
  const [people, setPeople] = useLocalStorage('split-people', []);
  // Groups: { id, name, peopleIds: [] }
  const [groups, setGroups] = useLocalStorage('split-groups', []);
  // Bills: { id, title, date, total, items:[{id,name,price,people:[]}], fees:[{id,name,amount}], participants:[] }
  const [storedBills, setBills] = useLocalStorage('split-bills', []);
  // Every bill that leaves this store carries a real total.
  //
  // `addBill` derives one on write, but that only protects bills this version
  // wrote. A backup restored from an older build, or any row that predates the
  // fix, has no `total` — and three separate screens rendered `bill.total || 0`
  // straight, so a whole history showed ₱0.00 while the per-person figures
  // underneath were right. Deriving once here is the only place that cannot
  // drift; the raw rows are what we persist.
  const bills = useMemo(() => storedBills.map(withDerivedTotal), [storedBills]);
  // Payments made TO you: { id, personId, amount, date, note }
  const [payments, setPayments] = useLocalStorage('split-payments', []);
  // Which person represents "you" — excluded from "owes you" totals.
  const [meId, setMeId] = useLocalStorage('split-me', null);
  // How friends pay you back: { method: 'GCash'|'Maya'|'Bank'|…, number, qr (data URL) }
  const [payInfo, setPayInfo] = useLocalStorage('split-payinfo', null);
  // How much detail outbound messages carry — set in the share sheet, remembered
  // between sends so you configure it once.
  const [shareOptions, setShareOptions] = useLocalStorage('split-shareopts', DEFAULT_SHARE_OPTIONS);
  // Splits you deliberately saved to repeat. Distinct from the ones inferred
  // from history: these you chose, so they outrank anything guessed.
  const [templates, setTemplates] = useLocalStorage('split-templates', []);
  // Which currency amounts are WRITTEN in. It converts nothing — see the
  // label in settings, which says so in as many words.
  const [currency, setCurrencyState] = useLocalStorage(CURRENCY_KEY, DEFAULT_CURRENCY);
  // The crew a new split starts with: { kind: 'person'|'group', id } or null.
  // Stored as a reference rather than a list of ids so renaming a group or
  // changing who is in it carries straight through to the next split.
  const [usual, setUsual] = useLocalStorage('split-usual', null);
  // The tip you left last time, offered as the default for the next bill.
  const [lastTipPct, setLastTipPct] = useLocalStorage('split-tip', 0);
  // When each person was last actually reminded: { [personId]: epochMs }.
  // Written only when a reminder really left the app — see recordNudge.
  const [nudges, setNudges] = useLocalStorage('split-nudges', {});

  /**
   * Applies the currency before the state change that re-renders the app.
   *
   * configureCurrency() is called here in the handler rather than left to an
   * effect for the same reason the module-scope bootstrap above exists: an
   * effect fires after paint, so the figures would render once in the old
   * currency first.
   */
  const setCurrency = useCallback((code) => {
    setCurrencyState(configureCurrency(code));
  }, [setCurrencyState]);

  // The safety net, not the mechanism: re-applies after a restore, after a
  // clear, and when another tab changes the key. Idempotent.
  useEffect(() => {
    configureCurrency(currency);
  }, [currency]);

  // --- People ---
  const addPerson = useCallback((name) => {
    const id = uid();
    setPeople((prev) => [...prev, { id, name: name.trim() }]);
    return id;
  }, [setPeople]);

  /**
   * Removes a person and hands back everything needed to put them back.
   *
   * Deleting someone strips their group membership, clears "me" if it was
   * them, and drops their outstanding balance — so the delete returns a
   * snapshot and `restorePerson(snapshot)` reverses it exactly. Pair the two
   * through `useUndoableAction` rather than guarding the delete with a dialog.
   *
   *   const snapshot = removePerson(id);
   *   // ...then, if the user taps Undo within the window:
   *   restorePerson(snapshot);
   */
  const removePerson = useCallback((id) => {
    const next = removePersonFrom({ people, groups, meId }, id);
    if (!next.snapshot) return null;
    setPeople(next.people);
    setGroups(next.groups);
    if (next.meId !== meId) setMeId(next.meId);
    return next.snapshot;
  }, [people, groups, meId, setPeople, setGroups, setMeId]);

  const restorePerson = useCallback((snapshot) => {
    if (!snapshot) return;
    const next = restorePersonTo({ people, groups, meId }, snapshot);
    setPeople(next.people);
    setGroups(next.groups);
    if (next.meId !== meId) setMeId(next.meId);
  }, [people, groups, meId, setPeople, setGroups, setMeId]);

  const renamePerson = useCallback((id, name) => {
    setPeople((prev) => prev.map((p) => (p.id === id ? { ...p, name: name.trim() } : p)));
  }, [setPeople]);

  // --- Groups ---
  const addGroup = useCallback((name, peopleIds) => {
    const id = uid();
    setGroups((prev) => [...prev, { id, name: name.trim(), peopleIds }]);
    return id;
  }, [setGroups]);

  /** Same contract as removePerson: returns a snapshot for `restoreGroup`. */
  const removeGroup = useCallback((id) => {
    const { groups: next, snapshot } = removeGroupFrom(groups, id);
    if (!snapshot) return null;
    setGroups(next);
    return snapshot;
  }, [groups, setGroups]);

  const restoreGroup = useCallback((snapshot) => {
    if (!snapshot) return;
    setGroups((prev) => restoreGroupTo(prev, snapshot));
  }, [setGroups]);

  // --- Bills ---
  const addBill = useCallback((bill) => {
    const id = uid();
    setBills((prev) => [...prev, withDerivedTotal({
      ...bill,
      title: (bill.title || '').trim() || 'Quick split',
      id,
      date: bill.date || new Date().toISOString(),
    })]);
    return id;
  }, [setBills]);

  const updateBill = useCallback((id, patch) => {
    setBills((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }, [setBills]);

  /**
   * Deletes a bill AND the payments that were covering it.
   *
   * Left behind, those payments stay in the person's pool and silently credit
   * their next split — their row reads "settled", they drop out of "owes you",
   * and the collection rate reports 100% while you are down real money.
   */
  const removeBill = useCallback((id) => {
    setPayments((prev) => paymentsWithoutBill({ bills, payments: prev, billId: id, meId }));
    setBills((prev) => prev.filter((b) => b.id !== id));
  }, [bills, meId, setBills, setPayments]);

  // --- Payments ---
  const addPayment = useCallback((personId, amount, note = '') => {
    if (!(amount > 0)) return;
    // Stored to the centavo. A "half of ₱3.33" button produced 1.665, and two
    // of those read as two ₱1.67 rows against a ₱3.33 debt that never closed.
    const exact = fromCents(toCents(amount));
    setPayments((prev) => [...prev, { id: uid(), personId, amount: exact, note, date: new Date().toISOString() }]);
  }, [setPayments]);

  const removePayment = useCallback((id) => {
    setPayments((prev) => prev.filter((p) => p.id !== id));
  }, [setPayments]);

  // --- Derived settlement data ---
  // The arithmetic itself lives in utils/settlement.js, where it can be tested
  // without rendering a provider. This is only the memo around it.
  const {
    balances, personBillShares, lifetimePayments, paymentsByPerson, billDuesById,
    billPersonStatus, unpaidBillShares, settledBillShares, credits,
  } = useMemo(
    () => computeSettlement({ people, bills, payments, meId }),
    [people, bills, payments, meId],
  );

  /**
   * The people a new split starts with, and what to call them on screen.
   *
   * Resolved on read rather than stored as a list: a group that gains a
   * flatmate should start the next split with the flatmate on it, without
   * anybody going back to settings to say so. A reference to someone since
   * deleted resolves to nothing at all — the banner then doesn't render and
   * step 1 opens empty, which is the right failure: never a silently wrong
   * crew, and the setting is one tap away in settings.
   */
  const usualCrew = useMemo(
    () => resolveUsual({ usual, people, groups }),
    [usual, people, groups],
  );

  // True while the app still doesn't know which person is the user — until it
  // does, every outbound message invoices them for their own dinner.
  const needsSelfIdentity = useMemo(() => needsSelf({ people, meId }), [people, meId]);

  // Total others still owe you (your own share never counts).
  const totalOwedToYou = useMemo(() => (
    people.reduce((sum, p) => {
      if (p.id === meId) return sum;
      const bal = balances[p.id] || 0;
      return bal > SETTLED_EPSILON ? sum + bal : sum;
    }, 0)
  ), [people, balances, meId]);

  // --- Nudges: when you last actually chased someone ---
  /**
   * Stamps everyone a reminder just went out to.
   *
   * Called from the share sheet and ONLY on a send or copy that really
   * succeeded — never on opening the sheet, and never when the native share
   * sheet is dismissed. A marker that appears because you looked at a message
   * is worse than no marker: it would stop you sending the one reminder that
   * was still owed.
   */
  const recordNudge = useCallback((ids, now = Date.now()) => {
    setNudges((prev) => recordNudges(prev, ids, now));
  }, [setNudges]);

  /**
   * Retires markers the moment they stop being true.
   *
   * Settling a debt is the event that ends the chase, and it can arrive from
   * four places — a payment, an edited bill, a deleted bill, a deleted
   * person. Rather than hanging a clear on each, the marker is pruned against
   * the balances themselves, which is the one thing all four move. pruneNudges
   * hands back the same object when nothing changed, so this does not write
   * on every recalculation.
   */
  useEffect(() => {
    setNudges((prev) => pruneNudges(prev, { people, balances }));
  }, [people, balances, setNudges]);

  // --- Sharing: messages you send out to collect ---
  // Only the CURRENTLY unpaid bills drive the ask — anything already settled
  // (via the oldest-first payment allocation above) stays out unless the share
  // options opt into listing past splits. `overrides` lets the share sheet
  // preview a shape before it's committed to storage.
  const buildShareText = useCallback((personId, overrides) => {
    const person = people.find((p) => p.id === personId);
    if (!person) return '';
    return buildPersonRequest({
      person,
      amount: balances[personId] || 0,
      unpaid: unpaidBillShares[personId] || [],
      settled: settledBillShares[personId] || [],
      paidTotal: lifetimePayments[personId] || 0,
      // Outbound, the organizer is "me" from the reader's point of view — their
      // stored name (usually the literal "Me") would read as a stranger's.
      nameOf: (id) => (id === meId ? 'me' : people.find((p) => p.id === id)?.name),
      payInfo,
      options: { ...shareOptions, ...(overrides || {}) },
    });
  }, [people, meId, balances, unpaidBillShares, settledBillShares, lifetimePayments, payInfo, shareOptions]);

  // One combined message listing every current outstanding balance — meant
  // to be posted ONCE into a shared group chat, rather than sent 1:1 to each
  // person like buildShareText. Pass { peopleIds, label } to scope it to one
  // saved group instead of everyone (e.g. only your "Barkada").
  const buildGroupReminderText = useCallback((scope = {}, overrides) => {
    const { peopleIds, label } = scope;
    const only = peopleIds ? new Set(peopleIds) : null;

    const rows = people
      .filter((p) => p.id !== meId)
      .filter((p) => !only || only.has(p.id))
      .map((p) => ({
        name: p.name,
        amount: balances[p.id] || 0,
        paid: lifetimePayments[p.id] || 0,
      }))
      .filter((r) => r.amount > SETTLED_EPSILON)
      .sort((a, b) => b.amount - a.amount);

    return buildGroupReminder({
      rows,
      label,
      payInfo,
      options: { ...shareOptions, ...(overrides || {}) },
    });
  }, [people, meId, balances, lifetimePayments, payInfo, shareOptions]);

  // --- Backup / restore ---
  const exportData = useCallback(() => JSON.stringify(
    {
      version: 5,
      exportedAt: new Date().toISOString(),
      people, groups, bills, payments, meId, payInfo, templates, currency,
      usual, lastTipPct, nudges,
    },
    null,
    2,
  ), [people, groups, bills, payments, meId, payInfo, templates, currency, usual, lastTipPct, nudges]);

  const importData = useCallback((json) => {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    if (!data || !Array.isArray(data.people)) throw new Error('Invalid backup file');
    const arr = (v) => (Array.isArray(v) ? v : []);
    setPeople(arr(data.people));
    setGroups(arr(data.groups));
    setBills(arr(data.bills));
    setPayments(arr(data.payments));
    setMeId(typeof data.meId === 'string' ? data.meId : null);
    setPayInfo(data.payInfo && typeof data.payInfo === 'object' ? data.payInfo : null);
    // Absent from a version-1 backup, which is fine: no templates existed
    // then. A version-2 or -3 template has no cadence on it either, and an
    // undefined cadence would make nextDueAt() read a missing field on every
    // render — so every restored template is filled out to the current shape
    // here, once, rather than defended against everywhere downstream.
    // All three are absent before version 4, and readBackupExtras resolves
    // each to its fresh-install value rather than to a guess. A usual crew
    // naming somebody who isn't in this backup is restored as written and
    // resolved on read, so it can only ever come out as nobody.
    const extras = readBackupExtras(data);
    setTemplates(extras.templates);
    setUsual(extras.usual);
    setLastTipPct(extras.lastTipPct);
    // Absent before version 5, and resolved to an empty history rather than
    // to a guess. A restored file can forget that you chased someone; it can
    // never claim you did.
    setNudges(extras.nudges);
    // Absent from versions 1 and 2, and not to be trusted even when present:
    // configureCurrency resolves anything it doesn't recognise back to PHP and
    // hands us the code that actually took effect, so a backup from before
    // this setting restores in pesos instead of rendering "undefined480".
    setCurrencyState(configureCurrency(data.currency));
  }, [
    setPeople, setGroups, setBills, setPayments, setMeId, setPayInfo, setTemplates,
    setCurrencyState, setUsual, setLastTipPct, setNudges,
  ]);

  const clearAll = useCallback(() => {
    setPeople([]);
    setGroups([]);
    setBills([]);
    setPayments([]);
    setMeId(null);
    setPayInfo(null);
    setTemplates([]);
    setUsual(null);
    setLastTipPct(0);
    setNudges({});
  }, [
    setPeople, setGroups, setBills, setPayments, setMeId, setPayInfo, setTemplates,
    setUsual, setLastTipPct, setNudges,
  ]);

  // --- Templates & quick repeat ---
  const addTemplate = useCallback((tpl) => {
    const id = uid();
    setTemplates((prev) => [...prev, {
      id,
      title: (tpl.title || '').trim() || 'Quick split',
      people: tpl.people || [],
      amount: Number(tpl.amount) || 0,
      // A cadence turns a saved split into a recurring one. 'none' is the
      // default and a real answer: handy, but never a prompt.
      cadence: tpl.cadence || 'none',
      // The clock has to start somewhere before the split has ever been
      // logged from here, or a brand-new monthly reminder is due at once.
      createdAt: Date.now(),
      snoozedUntil: null,
      lastUsed: null,
    }]);
    return id;
  }, [setTemplates]);

  /**
   * "Not now" on a due prompt: pushes it past today without deleting it.
   *
   * It moves the prompt, not the cadence — `lastUsed` is untouched, so a rent
   * split dismissed on the 1st and made on the 3rd still falls due on the 3rd
   * next month, rather than drifting by every dismissal.
   */
  const snoozeTemplate = useCallback((id, until) => {
    setTemplates((prev) => prev.map(
      (t) => (t.id === id ? { ...t, snoozedUntil: until || Date.now() + 86400000 } : t),
    ));
  }, [setTemplates]);

  const removeTemplate = useCallback((id) => {
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  }, [setTemplates]);

  const updateTemplate = useCallback((id, patch) => {
    setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, [setTemplates]);

  /**
   * Logs a whole split in one call: one item covering the amount, split
   * evenly between the named people. This is the entire point of the
   * suggestion row — anything needing per-item detail belongs in the wizard.
   */
  const logQuickSplit = useCallback(({ title, people: ids, amount, templateId }) => {
    const amt = Number(amount) || 0;
    const participants = (ids || []).filter(Boolean);
    if (amt <= 0 || participants.length === 0) return null;

    const billId = addBill({
      title,
      participants,
      fees: [],
      items: [{ id: uid(), name: title, price: amt, people: participants }],
      total: amt,
    });
    // Using a template counts as using it, so it keeps its place in the row —
    // and restarts its cadence, which is also what clears any snooze: the
    // split has been made, so the reminder has done its job.
    if (templateId) updateTemplate(templateId, { lastUsed: Date.now(), snoozedUntil: null });
    return billId;
  }, [addBill, updateTemplate]);

  const value = useMemo(() => ({
    people, addPerson, removePerson, restorePerson, renamePerson,
    groups, addGroup, removeGroup, restoreGroup,
    bills, addBill, updateBill, removeBill,
    payments, addPayment, removePayment,
    meId, setMeId,
    payInfo, setPayInfo,
    balances, personBillShares, lifetimePayments, paymentsByPerson, billDuesById,
    billPersonStatus, unpaidBillShares, settledBillShares, credits,
    needsSelfIdentity,
    shareOptions, setShareOptions,
    currency, setCurrency,
    templates, addTemplate, removeTemplate, updateTemplate, snoozeTemplate, logQuickSplit,
    usual, setUsual, usualCrew,
    lastTipPct, setLastTipPct,
    nudges, recordNudge,
    totalOwedToYou,
    buildShareText, buildGroupReminderText, exportData, importData, clearAll,
  }), [
    people, addPerson, removePerson, restorePerson, renamePerson,
    groups, addGroup, removeGroup, restoreGroup,
    bills, addBill, updateBill, removeBill,
    payments, addPayment, removePayment,
    meId, setMeId,
    payInfo, setPayInfo,
    balances, personBillShares, lifetimePayments, paymentsByPerson, billDuesById,
    billPersonStatus, unpaidBillShares, settledBillShares, credits,
    needsSelfIdentity,
    shareOptions, setShareOptions,
    currency, setCurrency,
    templates, addTemplate, removeTemplate, updateTemplate, snoozeTemplate, logQuickSplit,
    usual, setUsual, usualCrew,
    lastTipPct, setLastTipPct,
    nudges, recordNudge,
    totalOwedToYou,
    buildShareText, buildGroupReminderText, exportData, importData, clearAll,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  return useContext(AppContext);
}
