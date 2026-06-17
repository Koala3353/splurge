import { useAppContext } from '../store/AppContext';
import { formatCurrency } from '../utils/format';
import Navigation from '../components/Navigation';

export default function HomePage() {
  const { bills, balances } = useAppContext();

  const totalOwedToYou = Object.values(balances).reduce((sum, bal) => bal > 0 ? sum + bal : sum, 0);

  return (
    <div className="app-shell animate-slide-in">
      <main className="app-main">
        <div className="glass-panel text-center mb-6" style={{ padding: '2rem 1rem' }}>
          <p className="text-secondary mb-4">Total Owed to You</p>
          <h1 style={{ fontSize: '3rem', color: 'var(--success)' }}>{formatCurrency(totalOwedToYou)}</h1>
        </div>

        <h2 className="text-lg mb-4">Recent Bills</h2>
        <div className="flex-col gap-4">
          {bills.length === 0 ? (
            <p className="text-center text-secondary">No bills yet. Tap "New Bill" to get started.</p>
          ) : (
            [...bills].reverse().slice(0, 5).map(bill => {
              const totalCost = bill.total || 0;
              return (
                <div key={bill.id} className="glass-panel flex justify-between items-center mb-4" style={{ padding: '1rem' }}>
                  <div>
                    <h3 className="text-lg font-bold">{bill.title || 'Untitled Split'}</h3>
                    <p className="text-xs text-secondary mt-1">{new Date(bill.date).toLocaleDateString()} • {bill.items.length} items</p>
                  </div>
                  <div className="text-xl font-bold">
                    {formatCurrency(totalCost)}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </main>
      <Navigation />
    </div>
  );
}
