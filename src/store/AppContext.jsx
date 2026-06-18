/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  // People list: { id, name }
  const [people, setPeople] = useLocalStorage('split-people', []);
  // Groups list: { id, name, peopleIds: [] }
  const [groups, setGroups] = useLocalStorage('split-groups', []);
  // Bills list: { id, date, total, items: [{name, price, people: [id1, id2]}], tax, tip, image }
  const [bills, setBills] = useLocalStorage('split-bills', []);
  // Payments (settlements): { id, personId, amount, date }
  // Since everyone owes the user, this represents payments made TO the user.
  const [payments, setPayments] = useLocalStorage('split-payments', []);

  const addPerson = (name) => {
    setPeople([...people, { id: crypto.randomUUID(), name }]);
  };

  const removePerson = (id) => {
    setPeople(people.filter(p => p.id !== id));
  };

  const addGroup = (name, peopleIds) => {
    setGroups([...groups, { id: crypto.randomUUID(), name, peopleIds }]);
  };

  const removeGroup = (id) => {
    setGroups(groups.filter(g => g.id !== id));
  };

  const addBill = (bill) => {
    setBills([...bills, { ...bill, title: bill.title || 'Untitled Split', id: crypto.randomUUID(), date: new Date().toISOString() }]);
  };

  const addPayment = (personId, amount) => {
    setPayments([...payments, { id: crypto.randomUUID(), personId, amount, date: new Date().toISOString() }]);
  };

  // Calculate debts and detailed stats
  const { balances, personBillShares, lifetimePayments } = useMemo(() => {
    const bals = {};
    const shares = {}; // { [personId]: [{ bill, amount }] }
    const lifePayments = {}; // { [personId]: totalAmount }

    people.forEach(p => {
      bals[p.id] = 0;
      shares[p.id] = [];
      lifePayments[p.id] = 0;
    });

    // Add up what they owe from bills
    bills.forEach(bill => {
      const itemsTotal = bill.items.reduce((sum, item) => sum + item.price, 0);
      const feesTotal = (bill.fees || []).reduce((sum, fee) => sum + fee.amount, 0);

      // Temporary object to hold calculated dues for this specific bill
      const billDues = {};
      const participants = bill.participants || [];
      participants.forEach(pId => billDues[pId] = 0);

      bill.items.forEach(item => {
        if (!item.people || item.people.length === 0) return;
        const splitAmount = item.price / item.people.length;
        item.people.forEach(pId => {
          if (billDues[pId] !== undefined) billDues[pId] += splitAmount;
        });
      });

      if (itemsTotal !== 0 && feesTotal !== 0) {
        participants.forEach(pId => {
          const proportion = billDues[pId] / itemsTotal;
          billDues[pId] += (feesTotal * proportion);
        });
      } else if (itemsTotal === 0 && feesTotal !== 0 && participants.length > 0) {
        const split = feesTotal / participants.length;
        participants.forEach(pId => billDues[pId] += split);
      }

      // Add bill dues to global balances and person shares
      participants.forEach(pId => {
        if (bals[pId] !== undefined) {
          bals[pId] += billDues[pId];
        }
        if (shares[pId] !== undefined && billDues[pId] > 0) {
          shares[pId].push({
            bill,
            amount: billDues[pId]
          });
        }
      });
    });

    // Process lifetime payments and subtract what they have paid
    payments.forEach(payment => {
      if (lifePayments[payment.personId] !== undefined) {
        lifePayments[payment.personId] += payment.amount;
      }
      if (bals[payment.personId] !== undefined) {
        bals[payment.personId] -= payment.amount;
      }
    });

    return { balances: bals, personBillShares: shares, lifetimePayments: lifePayments };
  }, [people, bills, payments]);

  return (
    <AppContext.Provider value={{
      people, addPerson, removePerson,
      groups, addGroup, removeGroup,
      bills, addBill,
      payments, addPayment,
      balances,
      personBillShares,
      lifetimePayments
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  return useContext(AppContext);
}
