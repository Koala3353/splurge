import { useAppContext } from '../store/AppContext';
import { formatCurrency } from '../utils/format';
import Navigation from '../components/Navigation';
import { TrendingUp, Users, DollarSign, Award, ArrowUpRight } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function StatsPage() {
  const { bills, people, balances } = useAppContext();

  const totalOutings = bills.length;
  const totalSpent = bills.reduce((sum, bill) => sum + bill.total, 0);

  // Sort people by balance to create a leaderboard
  const leaderboard = Object.entries(balances)
    .map(([id, bal]) => ({ person: people.find(p => p.id === id), bal }))
    .filter(item => item.person && item.bal > 0)
    .sort((a, b) => b.bal - a.bal);

  const barData = leaderboard.map(item => ({
    name: item.person.name,
    amount: item.bal
  }));

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="glass-panel" style={{ padding: '0.5rem 1rem', border: '1px solid var(--glass-border)' }}>
          <p className="text-sm font-bold text-secondary">{label}</p>
          <p className="font-bold text-accent">{formatCurrency(payload[0].value)}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="app-shell">
      <main className="app-main">
        <h1 className="text-xl mb-6 font-bold flex items-center gap-2">
          <TrendingUp className="text-accent" /> Statistics
        </h1>

        <div className="flex gap-4 mb-6">
          <div className="glass-panel flex-1" style={{ padding: '1.5rem 1rem' }}>
            <div className="flex items-center gap-2 text-secondary mb-2">
              <Users size={16} /> <span className="text-sm font-medium uppercase tracking-wider">Outings</span>
            </div>
            <h2 style={{ fontSize: '2.5rem', fontWeight: '800' }}>{totalOutings}</h2>
          </div>

          <div className="glass-panel flex-1 relative overflow-hidden" style={{ padding: '1.5rem 1rem', background: 'var(--gradient-primary)', border: 'none' }}>
            <div className="absolute opacity-20 -right-4 -bottom-4">
              <DollarSign size={80} />
            </div>
            <div className="relative z-10">
              <div className="flex items-center gap-2 text-white mb-2 opacity-90">
                <DollarSign size={16} /> <span className="text-sm font-medium uppercase tracking-wider">Total Spent</span>
              </div>
              <h2 className="text-white" style={{ fontSize: '2rem', fontWeight: '800' }}>{formatCurrency(totalSpent)}</h2>
            </div>
          </div>
        </div>

        {barData.length > 0 && (
          <div className="mb-10">
            <h2 className="text-lg mb-3 font-bold">Who owes you most</h2>
            <div className="glass-panel" style={{ height: '200px', padding: '1rem' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} width={80} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--glass-bg)' }} />
                  <Bar dataKey="amount" fill="var(--danger)" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <h2 className="text-lg mb-4 font-bold">Top Owers Leaderboard</h2>
        
        <div className="flex-col gap-4 mb-10" style={{ paddingBottom: '1rem' }}>
          {leaderboard.length === 0 ? (
            <p className="text-center text-secondary py-8 glass-panel border-dashed">No debts to show yet!</p>
          ) : (
            leaderboard.map((item, index) => (
              <div key={item.person.id} className="glass-panel flex justify-between items-center p-4">
                <div className="flex items-center gap-4">
                  <div className={`avatar ${index === 0 ? 'bg-danger' : index === 1 ? 'bg-warning' : 'bg-accent'}`} style={{ width: '48px', height: '48px', fontSize: '1.25rem' }}>
                    {index === 0 ? <Award size={24} /> : item.person.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">{item.person.name}</h3>
                    <p className="text-xs text-secondary mt-1 flex items-center gap-1">
                      <ArrowUpRight size={12} className="text-danger" /> Needs to pay you
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-xl">{formatCurrency(item.bal)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </main>
      <Navigation />
    </div>
  );
}
