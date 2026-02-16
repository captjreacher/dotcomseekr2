import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import CreateProjectPage from './pages/CreateProjectPage';
import JourneyExplorerPage from './pages/JourneyExplorerPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/create" element={<CreateProjectPage />} />
        <Route path="/project/:id" element={<JourneyExplorerPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
