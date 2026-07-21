import { Outlet } from 'react-router-dom';
import Navigation from './Navigation';

export default function AppLayout() {
  return (
    <div className="app-shell">
      <Outlet />
      <Navigation />
    </div>
  );
}
