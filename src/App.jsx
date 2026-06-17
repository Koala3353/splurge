import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AppProvider } from './store/AppContext';
import Navigation from './components/Navigation';
import HomePage from './pages/HomePage';
import PeoplePage from './pages/PeoplePage';
import NewBillPage from './pages/NewBillPage';
import StatsPage from './pages/StatsPage';

function App() {
  return (
    <AppProvider>
      <Router basename={import.meta.env.BASE_URL}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/people" element={<PeoplePage />} />
          <Route path="/new-bill" element={<NewBillPage />} />
          <Route path="/stats" element={<StatsPage />} />
        </Routes>
      </Router>
    </AppProvider>
  );
}

export default App;
