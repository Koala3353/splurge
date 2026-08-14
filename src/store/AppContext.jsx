/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo, useCallback } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { computeBillDues } from '../utils/split';
import {
  DEFAULT_SHARE_OPTIONS,
  buildPersonRequest,
  buildGroupReminder,
} from '../utils/shareText';

const AppContext = createContext(null);

const uid = () =>
  (crypto?.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.round(Math.random() * 1e9)}`);

export function AppProvider({ children }) {
  // People: { id, name }
  const [people, setPeople] = useLocalStorage('split-people', []);
  // Groups: { id, name, peopleIds: [] }
  const [groups, setGroups] = useLocalStorage('split-groups', []);
  // Bills: { id, title, date, total, items:[{id,name,price,people:[]}], fees:[{id,name,amount}], participants:[] }
  const [bills, setBills] = useLocalStorage('split-bills', []);
  // Payments made TO you: { id, personId, amount, date, note }
  const [payments, setPayments] = useLocalStorage('split-payments', []);
  // Which person represents "you" — excluded from "owes you" totals.
  const [meId, setMeId] = useLocalStorage('split-me', null);
  // How friends pay you back: { method: 'GCash'|'Maya'|'Bank'|…, number, qr (data URL) }
  const [payInfo, setPayInfo] = useLocalStorage('split-payinfo', null);
  // How much detail outbound messages carry — set in the share sheet, remembered
  // between sends so you configure it once.
  const [shareOptions, setShareOptions] = useLocalStorage('split-shareopts', DEFAULT_SHARE_OPTIONS);

  // --- People ---
  const addPerson = useCallback((name) => {
    const id = uid();
    setPeople((prev) => [...prev, { id, name: name.trim() }]);
    return id;
  }, [setPeople]);

  const removePerson = useCallback((id) => {
    setPeople((prev) => prev.filter((p) => p.id !== id));
    setGroups((prev) => prev.map((g) => ({ ...g, peopleIds: g.peopleIds.filter((pid) => pid !== id) })));
    setMeId((prev) => (prev === id ? null : prev));
  }, [setPeople, setGroups, setMeId]);

  const renamePerson = useCallback((id, name) => {
    setPeople((prev) => prev.map((p) => (p.id === id ? { ...p, name: name.trim() } : p)));
  }, [setPeople]);

  // --- Groups ---
  const addGroup = useCallback((name, peopleIds) => {
    const id = uid();
    setGroups((prev) => [...prev, { id, name: name.trim(), peopleIds }]);
    return id;
  }, [setGroups]);

  const removeGroup = useCallback((id) => {
    setGroups((prev) => prev.filter((g) => g.id !== id));
  }, [setGroups]);

  // --- Bills ---
  const addBill = useCallback((bill) => {
    const id = uid();
    setBills((prev) => [...prev, {
      ...bill,
      title: (bill.title || '').trim() || 'Quick split',
      id,
      date: bill.date || new Date().toISOString(),
    }]);
    return id;
  }, [setBills]);

  const updateBill = useCallback((id, patch) => {
    setBills((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }, [setBills]);

  const removeBill = useCallback((id) => {
    setBills((prev) => prev.filter((b) => b.id !== id));
  }, [setBills]);

  // --- Payments ---
  const addPayment = useCallback((personId, amount, note = '') => {
    if (!(amount > 0)) return;
    setPayments((prev) => [...prev, { id: uid(), personId, amount, note, date: new Date().toISOString() }]);
  }, [setPayments]);

  const removePayment = useCallback((id) => {
    setPayments((prev) => prev.filter((p) => p.id !== id));
  }, [setPayments]);

  // --- Derived settlement data ---
  const {
    balances, personBillShares, lifetimePayments, paymentsByPerson, billDuesById,
    billPersonStatus, unpaidBillShares, settledBillShares,
  } = useMemo(() => {
    const bals = {};
    const shares = {};
    const life = {};
    const payByPerson = {};
    const duesById = {};
    const duesByPerson = {}; // { [personId]: [{bill, amount}] } — every share, incl. zero, for FIFO allocation

    people.forEach((p) => {
      bals[p.id] = 0;
      shares[p.id] = [];
      life[p.id] = 0;
      payByPerson[p.id] = [];
      duesByPerson[p.id] = [];
    });

    bills.forEach((bill) => {
      const { dues } = computeBillDues(bill);
      duesById[bill.id] = dues;
      Object.entries(dues).forEach(([pId, amt]) => {
        if (bals[pId] !== undefined) bals[pId] += amt;
        if (shares[pId] && amt > 0.005) shares[pId].push({ bill, amount: amt });
        if (duesByPerson[pId]) duesByPerson[pId].push({ bill, amount: amt });
      });
    });

    payments.forEach((pm) => {
      if (life[pm.personId] !== undefined) life[pm.personId] += pm.amount;
      if (bals[pm.personId] !== undefined) bals[pm.personId] -= pm.amount;
      if (payByPerson[pm.personId]) payByPerson[pm.personId].push(pm);
    });

    // Payments aren't earmarked to a specific bill — a person just pays you a
    // lump sum. To know which particular bills are actually settled (for the
    // per-bill "who's paid" view and to keep outbound messages from listing
    // stale bills someone already covered), allocate each person's lifetime
    // payments against their bills oldest-first (FIFO): the natural reading
    // of "pay off what you've owed longest."
    const billStatus = {};        // { [billId]: { [personId]: { due, paid, remaining } } }
    const unpaidShares = {};      // { [personId]: [{ bill, amount, remaining }] } — remaining > 0 only
    const settledShares = {};     // { [personId]: [{ bill, amount }] } — fully covered, newest first

    people.forEach((p) => {
      unpaidShares[p.id] = [];
      settledShares[p.id] = [];
      let pool = life[p.id] || 0;
      const ordered = [...duesByPerson[p.id]].sort((a, b) => new Date(a.bill.date) - new Date(b.bill.date));
      ordered.forEach(({ bill, amount }) => {
        const applied = amount > 0 ? Math.min(pool, amount) : 0;
        pool = Math.max(0, pool - applied);
        const remaining = Math.max(0, Math.round((amount - applied) * 100) / 100);
        if (!billStatus[bill.id]) billStatus[bill.id] = {};
        billStatus[bill.id][p.id] = { due: amount, paid: applied, remaining };
        if (remaining > 0.005) unpaidShares[p.id].push({ bill, amount, remaining });
        else if (amount > 0.005) settledShares[p.id].unshift({ bill, amount });
      });
    });

    return {
      balances: bals,
      personBillShares: shares,
      lifetimePayments: life,
      paymentsByPerson: payByPerson,
      billDuesById: duesById,
      billPersonStatus: billStatus,
      unpaidBillShares: unpaidShares,
      settledBillShares: settledShares,
    };
  }, [people, bills, payments]);

  // Total others still owe you (your own share never counts).
  const totalOwedToYou = useMemo(() => (
    people.reduce((sum, p) => {
      if (p.id === meId) return sum;
      const bal = balances[p.id] || 0;
      return bal > 0.005 ? sum + bal : sum;
    }, 0)
  ), [people, balances, meId]);

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
      .filter((r) => r.amount > 0.005)
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
    { version: 1, exportedAt: new Date().toISOString(), people, groups, bills, payments, meId, payInfo },
    null,
    2,
  ), [people, groups, bills, payments, meId, payInfo]);

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
  }, [setPeople, setGroups, setBills, setPayments, setMeId, setPayInfo]);

  const clearAll = useCallback(() => {
    setPeople([]);
    setGroups([]);
    setBills([]);
    setPayments([]);
    setMeId(null);
    setPayInfo(null);
  }, [setPeople, setGroups, setBills, setPayments, setMeId, setPayInfo]);

  const value = useMemo(() => ({
    people, addPerson, removePerson, renamePerson,
    groups, addGroup, removeGroup,
    bills, addBill, updateBill, removeBill,
    payments, addPayment, removePayment,
    meId, setMeId,
    payInfo, setPayInfo,
    balances, personBillShares, lifetimePayments, paymentsByPerson, billDuesById,
    billPersonStatus, unpaidBillShares, settledBillShares,
    shareOptions, setShareOptions,
    totalOwedToYou,
    buildShareText, buildGroupReminderText, exportData, importData, clearAll,
  }), [
    people, addPerson, removePerson, renamePerson,
    groups, addGroup, removeGroup,
    bills, addBill, updateBill, removeBill,
    payments, addPayment, removePayment,
    meId, setMeId,
    payInfo, setPayInfo,
    balances, personBillShares, lifetimePayments, paymentsByPerson, billDuesById,
    billPersonStatus, unpaidBillShares, settledBillShares,
    shareOptions, setShareOptions,
    totalOwedToYou,
    buildShareText, buildGroupReminderText, exportData, importData, clearAll,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  return useContext(AppContext);
}
