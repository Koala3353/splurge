import { Outlet, useLocation } from 'react-router-dom';
import Navigation from './Navigation';
import UpdatePrompt from './UpdatePrompt';
import './shell.css';

// Routes that own the bottom of the screen themselves. The new-bill wizard
// ends in its own Back / Next bar, and two stacked bars is both a collision
// and a question the user shouldn't have to answer — leaving mid-wizard is
// what the Cancel button and its discard prompt are for.
const OWNS_BOTTOM = ['/new-bill'];

export default function AppLayout() {
  const { pathname } = useLocation();
  const showNav = !OWNS_BOTTOM.includes(pathname);

  return (
    // With no tab bar there is nothing to clear, so the clearance drops away
    // and the page gets that strip of screen back.
    <div className={`app${showNav ? ' app--tabbed' : ' app-shell--no-tabbar'}`}>
      <Outlet />
      {showNav && <Navigation />}
      <UpdatePrompt />
    </div>
  );
}
