/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo, useCallback } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { computeBillDues } from '../utils/split';
import { formatCurrency } from '../utils/format';

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
  const { balances, personBillShares, lifetimePayments, paymentsByPerson, billDuesById } = useMemo(() => {
    const bals = {};
    const shares = {};
    const life = {};
    const payByPerson = {};
    const duesById = {};

    people.forEach((p) => {
      bals[p.id] = 0;
      shares[p.id] = [];
      life[p.id] = 0;
      payByPerson[p.id] = [];
    });

    bills.forEach((bill) => {
      const { dues } = computeBillDues(bill);
      duesById[bill.id] = dues;
      Object.entries(dues).forEach(([pId, amt]) => {
        if (bals[pId] !== undefined) bals[pId] += amt;
        if (shares[pId] && amt > 0.005) shares[pId].push({ bill, amount: amt });
      });
    });

    payments.forEach((pm) => {
      if (life[pm.personId] !== undefined) life[pm.personId] += pm.amount;
      if (bals[pm.personId] !== undefined) bals[pm.personId] -= pm.amount;
      if (payByPerson[pm.personId]) payByPerson[pm.personId].push(pm);
    });

    return {
      balances: bals,
      personBillShares: shares,
      lifetimePayments: life,
      paymentsByPerson: payByPerson,
      billDuesById: duesById,
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

  // --- Sharing: a message you can send to a friend to collect ---
  const buildShareText = useCallback((personId) => {
    const person = people.find((p) => p.id === personId);
    if (!person) return '';
    const bal = balances[personId] || 0;
    const lines = (personBillShares[personId] || [])
      .map((s) => `• ${s.bill.title} — ${formatCurrency(s.amount)}`);
    const body = lines.length ? `\n${lines.join('\n')}` : '';
    return `Hey ${person.name} — your share comes to ${formatCurrency(Math.max(bal, 0))}:${body}\n\nNo rush, settle up whenever. Sent with Splurge.`;
  }, [people, balances, personBillShares]);

  // --- Backup / restore ---
  const exportData = useCallback(() => JSON.stringify(
    { version: 1, exportedAt: new Date().toISOString(), people, groups, bills, payments, meId },
    null,
    2,
  ), [people, groups, bills, payments, meId]);

  const importData = useCallback((json) => {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    if (!data || !Array.isArray(data.people)) throw new Error('Invalid backup file');
    const arr = (v) => (Array.isArray(v) ? v : []);
    setPeople(arr(data.people));
    setGroups(arr(data.groups));
    setBills(arr(data.bills));
    setPayments(arr(data.payments));
    setMeId(typeof data.meId === 'string' ? data.meId : null);
  }, [setPeople, setGroups, setBills, setPayments, setMeId]);

  const clearAll = useCallback(() => {
    setPeople([]);
    setGroups([]);
    setBills([]);
    setPayments([]);
    setMeId(null);
  }, [setPeople, setGroups, setBills, setPayments, setMeId]);

  const value = useMemo(() => ({
    people, addPerson, removePerson, renamePerson,
    groups, addGroup, removeGroup,
    bills, addBill, updateBill, removeBill,
    payments, addPayment, removePayment,
    meId, setMeId,
    balances, personBillShares, lifetimePayments, paymentsByPerson, billDuesById,
    totalOwedToYou,
    buildShareText, exportData, importData, clearAll,
  }), [
    people, addPerson, removePerson, renamePerson,
    groups, addGroup, removeGroup,
    bills, addBill, updateBill, removeBill,
    payments, addPayment, removePayment,
    meId, setMeId,
    balances, personBillShares, lifetimePayments, paymentsByPerson, billDuesById,
    totalOwedToYou,
    buildShareText, exportData, importData, clearAll,
  ]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  return useContext(AppContext);
}
