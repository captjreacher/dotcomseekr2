import { BrowserRouter, Routes, Route } from 'react-router-dom';
import FrontScreenPage from './pages/FrontScreenPage';
import DiscoverPage from './pages/DiscoverPage';
import CreateProjectPage from './pages/CreateProjectPage';
import JourneyExplorerPage from './pages/JourneyExplorerPage';
import HealthTestPage from './pages/HealthTestPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<FrontScreenPage />} />
        <Route path="/discover" element={<DiscoverPage />} />
        <Route path="/create" element={<CreateProjectPage />} />
        <Route path="/ideas/:id" element={<JourneyExplorerPage />} />
        <Route path="/project/:id" element={<JourneyExplorerPage />} />
        <Route path="/health-test" element={<HealthTestPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
