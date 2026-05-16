import { useEffect, useState } from 'react';
import { useAuth, useAuthStore } from './hooks/useAuth';
import { useMe } from './hooks/useMe';
import { HomePage } from './pages/Home';
import { PlanetDetailPage } from './pages/PlanetDetail';
import { SystemMapPage } from './pages/SystemMap';
import { SectorMapPage } from './pages/SectorMap';
import { ResearchPage } from './pages/Research';
import { ShipsPage } from './pages/Ships';
import { ProfilePage } from './pages/Profile';
import { ColoniesPage } from './pages/Colonies';
import { ShopPage } from './pages/Shop';
import { OnboardingPage } from './pages/onboarding/Onboarding';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { I18nProvider, useI18n } from './lib/i18n';
import { trackFrontendEvent } from './lib/analytics';

const queryClient = new QueryClient();

function readTutorialOverlayDismissed(): boolean {
  try {
    return sessionStorage.getItem('nu_tutorial_overlay_dismissed') === '1';
  } catch {
    return false;
  }
}

function AppContent() {
  const { login, isLoading: isAuthLoading, error: authError } = useAuth();
  const authUser = useAuthStore((state) => state.user);
  const { data: meData, isLoading: isMeLoading } = useMe();
  const { setLocale, t } = useI18n();
  const [tutorialHidden, setTutorialHidden] = useState(false);
  const [tutorialOverlayDismissed, setTutorialOverlayDismissed] = useState(readTutorialOverlayDismissed);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    login().catch(console.error);
  }, [login]);

  useEffect(() => {
    trackFrontendEvent('client_session_started', {
      path: location.pathname,
    });
  }, []);

  useEffect(() => {
    trackFrontendEvent('page_viewed', {
      path: location.pathname,
    });
  }, [location.pathname]);

  useEffect(() => {
    const preferredLocale = meData?.preferredLocale ?? authUser?.preferredLocale;
    if (preferredLocale) {
      setLocale(preferredLocale);
    }
  }, [authUser?.preferredLocale, meData?.preferredLocale, setLocale]);

  useEffect(() => {
    if (meData?.tutorialCompletedAt) {
      setTutorialHidden(false);
      try {
        sessionStorage.removeItem('nu_tutorial_overlay_dismissed');
      } catch {
        /* ignore */
      }
      setTutorialOverlayDismissed(false);
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
        <p className="text-red-500">{t('app.authFailed', { message: authError.message })}</p>
      </div>
    );
  }

  const showTutorial = Boolean(meData && !meData.tutorialCompletedAt && !tutorialHidden);
  const forceOnboarding =
    showTutorial && !tutorialOverlayDismissed && location.pathname !== '/onboarding';
  if (forceOnboarding) {
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
      <Route
        path="/onboarding"
        element={
          <OnboardingPage
            onSkip={() => setTutorialHidden(true)}
            onContinueToGame={() => {
              try {
                sessionStorage.setItem('nu_tutorial_overlay_dismissed', '1');
              } catch {
                /* ignore */
              }
              setTutorialOverlayDismissed(true);
            }}
            onEnter={() => {
              try {
                sessionStorage.removeItem('nu_tutorial_overlay_dismissed');
              } catch {
                /* ignore */
              }
              setTutorialOverlayDismissed(false);
            }}
          />
        }
      />
      <Route path="/planet/:planetId" element={<PlanetDetailPage />} />
      <Route path="/map" element={<SystemMapPage />} />
      <Route path="/sector-map" element={<SectorMapPage />} />
      <Route path="/research" element={<ResearchPage />} />
      <Route path="/ships" element={<ShipsPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/colonies" element={<ColoniesPage />} />
      <Route path="/shop" element={<ShopPage />} />
    </Routes>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </I18nProvider>
    </QueryClientProvider>
  );
}

export default App;
