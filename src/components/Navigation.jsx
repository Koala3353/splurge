import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Receipt, PieChart, Users } from 'lucide-react';
import { flushSync } from 'react-dom';

const navOrder = { '/': 0, '/people': 1, '/new-bill': 2, '/stats': 3 };

export default function Navigation() {
  return (
    <nav className="app-footer" aria-label="Primary" style={{ padding: '0.75rem', justifyContent: 'space-around' }}>
      <NavItem to="/" icon={<Home size={24} />} label="Home" />
      <NavItem to="/people" icon={<Users size={24} />} label="People" />
      <NavItem to="/new-bill" icon={<Receipt size={24} />} label="New Bill" />
      <NavItem to="/stats" icon={<PieChart size={24} />} label="Stats" />
    </nav>
  );
}

function NavItem({ to, icon, label }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isActive = location.pathname === to;

  const handleClick = (e) => {
    e.preventDefault();
    if (isActive) return;

    const currentOrder = navOrder[location.pathname] ?? 0;
    const targetOrder = navOrder[to] ?? 0;
    const direction = targetOrder > currentOrder ? 'forward' : 'backward';

    if (!document.startViewTransition) {
      navigate(to);
      return;
    }

    document.startViewTransition({
      update: () => {
        flushSync(() => {
          navigate(to);
        });
      },
      types: [direction]
    });
  };

  return (
    <a
      href={to}
      onClick={handleClick}
      aria-label={label}
      aria-current={isActive ? 'page' : undefined}
      className="select-none"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4px',
        color: isActive ? 'var(--accent-color)' : 'var(--text-secondary)',
        textDecoration: 'none',
        fontSize: '0.75rem',
        fontWeight: isActive ? 600 : 400,
        transition: 'color 0.2s',
        padding: '0.25rem 0.75rem',
        minWidth: '56px'
      }}
    >
      {icon}
      <span>{label}</span>
    </a>
  );
}

