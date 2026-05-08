import { useEffect } from 'react';
import { useAuth } from './hooks/useAuth';
import { HomePage } from './pages/Home';
import { PlanetDetailPage } from './pages/PlanetDetail';
import { SystemMapPage } from './pages/SystemMap';
import { ResearchPage } from './pages/Research';
import { ShipsPage } from './pages/Ships';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

const queryClient = new QueryClient();

function AppContent() {
  const { login, isLoading: isAuthLoading, error: authError } = useAuth();

  useEffect(() => {
    login().catch(console.error);
  }, [login]);

  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (authError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
        <p className="text-red-500">Auth failed: {authError.message}</p>
      </div>
    );
  }
  
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/planet/:planetId" element={<PlanetDetailPage />} />
      <Route path="/map" element={<SystemMapPage />} />
      <Route path="/research" element={<ResearchPage />} />
      <Route path="/ships" element={<ShipsPage />} />
    </Routes>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
