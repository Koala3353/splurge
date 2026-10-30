import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Receipt, PieChart, Users } from 'lucide-react';
import { flushSync } from 'react-dom';

export default function Navigation() {
  return (
    <nav className="app-footer" aria-label="Primary">
      <NavItem to="/" icon={<Home size={20} />} label="Home" />
      <NavItem to="/people" icon={<Users size={20} />} label="People" />
      <NavItem to="/new-bill" icon={<Receipt size={20} />} label="New" />
      <NavItem to="/stats" icon={<PieChart size={20} />} label="Stats" />
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

    if (!document.startViewTransition) {
      navigate(to);
      return;
    }

    document.startViewTransition(() => {
      flushSync(() => {
        navigate(to);
      });
    });
  };

  return (
    <a
      href={to}
      onClick={handleClick}
      aria-label={label}
      aria-current={isActive ? 'page' : undefined}
      className={`nav-item select-none ${isActive ? 'nav-item-active' : ''}`}
    >
      {icon}
      {/* Shown only on the selected tab — four labels will not fit a pill at
          phone width. CSS hides it with display:none, which takes it out of
          the accessibility tree as well, so the name every tab is announced
          by is the aria-label above, not this. */}
      <span className="nav-label" aria-hidden="true">{label}</span>
    </a>
  );
}
