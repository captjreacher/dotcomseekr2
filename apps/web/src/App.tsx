import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import CreateProjectPage from './pages/CreateProjectPage';
import JourneyExplorerPage from './pages/JourneyExplorerPage';
import HealthTestPage from './pages/HealthTestPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/create" element={<CreateProjectPage />} />
        <Route path="/ideas/:id" element={<JourneyExplorerPage />} />
        <Route path="/project/:id" element={<JourneyExplorerPage />} />
        <Route path="/health-test" element={<HealthTestPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
