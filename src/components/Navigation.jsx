import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Receipt, PieChart, Users } from 'lucide-react';
import { flushSync } from 'react-dom';

/**
 * The tab bar.
 *
 * Four tabs, each a full quarter of the receipt column: 93 × 57px at phone
 * width, against the 36px tall items the audit measured. The glyph stays at
 * 20px — the target is the column around it, not the mark.
 *
 * The current route is marked three ways at once: full ink, a sunk field and
 * a pressed rule across the top of the tab. Colour is not one of them. In
 * this system the only chromatic mark left is money, so chrome cannot borrow
 * it to say "you are here".
 */
const TABS = [
  { to: '/', label: 'Home', Icon: Home },
  { to: '/people', label: 'People', Icon: Users },
  { to: '/new-bill', label: 'New', Icon: Receipt },
  { to: '/stats', label: 'Stats', Icon: PieChart },
];

export default function Navigation() {
  return (
    <nav className="tabbar" aria-label="Primary">
      <div className="tabbar__inner">
        {TABS.map((tab) => (
          <NavItem key={tab.to} {...tab} />
        ))}
      </div>
    </nav>
  );
}

function NavItem({ to, label, Icon }) {
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
      aria-current={isActive ? 'page' : undefined}
      className="tabbar__item"
    >
      <Icon size={20} strokeWidth={1.5} aria-hidden="true" />
      {/* The label is always shown — four 13px mono words fit the column at
          375px, and a tab whose name appears only once it is selected cannot
          be read before you tap it. */}
      <span>{label}</span>
    </a>
  );
}
