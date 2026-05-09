import { useEffect, useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { useMe } from './hooks/useMe';
import { HomePage } from './pages/Home';
import { PlanetDetailPage } from './pages/PlanetDetail';
import { SystemMapPage } from './pages/SystemMap';
import { SectorMapPage } from './pages/SectorMap';
import { ResearchPage } from './pages/Research';
import { ShipsPage } from './pages/Ships';
import { ProfilePage } from './pages/Profile';
import { ColoniesPage } from './pages/Colonies';
import { MarketPage } from './pages/Market';
import { OnboardingPage } from './pages/onboarding/Onboarding';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

const queryClient = new QueryClient();

function AppContent() {
  const { login, isLoading: isAuthLoading, error: authError } = useAuth();
  const { data: meData, isLoading: isMeLoading } = useMe();
  const [tutorialHidden, setTutorialHidden] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    login().catch(console.error);
  }, [login]);

  useEffect(() => {
    if (meData?.tutorialCompletedAt) {
      setTutorialHidden(false);
    }
  }, [meData?.tutorialCompletedAt]);

  if (isAuthLoading || isMeLoading) {
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

  const showTutorial = Boolean(meData && !meData.tutorialCompletedAt && !tutorialHidden);
  if (showTutorial && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          <HomePage
            onOpenTutorial={() => {
              setTutorialHidden(false);
              navigate('/onboarding');
            }}
          />
        }
      />
      <Route path="/onboarding" element={<OnboardingPage onSkip={() => setTutorialHidden(true)} />} />
      <Route path="/planet/:planetId" element={<PlanetDetailPage />} />
      <Route path="/map" element={<SystemMapPage />} />
      <Route path="/sector-map" element={<SectorMapPage />} />
      <Route path="/research" element={<ResearchPage />} />
      <Route path="/ships" element={<ShipsPage />} />
      <Route path="/market" element={<MarketPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/colonies" element={<ColoniesPage />} />
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
