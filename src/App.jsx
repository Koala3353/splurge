import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AppProvider } from './store/AppContext';
import AppLayout from './components/AppLayout';
import HomePage from './pages/HomePage';
import PeoplePage from './pages/PeoplePage';
import NewBillPage from './pages/NewBillPage';
import StatsPage from './pages/StatsPage';
import HistoryPage from './pages/HistoryPage';

function App() {
  return (
    <AppProvider>
      <Router basename={import.meta.env.BASE_URL}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/people" element={<PeoplePage />} />
            <Route path="/new-bill" element={<NewBillPage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/history" element={<HistoryPage />} />
          </Route>
        </Routes>
      </Router>
    </AppProvider>
  );
}

export default App;
