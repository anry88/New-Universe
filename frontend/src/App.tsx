import { Suspense, lazy, useEffect, useState } from 'react';
import { useAuth, useAuthStore } from './hooks/useAuth';
import { useMe } from './hooks/useMe';
import { useMeCompletionRefresh } from './hooks/useMeCompletionRefresh';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { I18nProvider, useI18n } from './lib/i18n';
import { trackFrontendEvent } from './lib/analytics';
import { hasTelegramAuthLaunchParams } from './lib/telegramRuntime';
import {
  openOnlineActivitySession,
  setOnlineActivityTrackingEnabled,
} from './lib/api';
import { PlayerNicknameDialog } from './components/PlayerNicknameDialog';

const queryClient = new QueryClient();

const HomePage = lazy(() => import('./pages/Home').then((module) => ({ default: module.HomePage })));
const PlanetDetailPage = lazy(() => import('./pages/PlanetDetail').then((module) => ({ default: module.PlanetDetailPage })));
const SystemMapPage = lazy(() => import('./pages/SystemMap').then((module) => ({ default: module.SystemMapPage })));
const SectorMapPage = lazy(() => import('./pages/SectorMap').then((module) => ({ default: module.SectorMapPage })));
const ResearchPage = lazy(() => import('./pages/Research').then((module) => ({ default: module.ResearchPage })));
const ShipsPage = lazy(() => import('./pages/Ships').then((module) => ({ default: module.ShipsPage })));
const ProfilePage = lazy(() => import('./pages/Profile').then((module) => ({ default: module.ProfilePage })));
const ColoniesPage = lazy(() => import('./pages/Colonies').then((module) => ({ default: module.ColoniesPage })));
const ShopPage = lazy(() => import('./pages/Shop').then((module) => ({ default: module.ShopPage })));
const OnboardingPage = lazy(() => import('./pages/onboarding/Onboarding').then((module) => ({ default: module.OnboardingPage })));

function AppLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
    </div>
  );
}

function TelegramOnlyScreen() {
  const { t } = useI18n();

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 px-6 text-center text-white">
      <div className="max-w-sm space-y-3">
        <h1 className="text-xl font-semibold">{t('app.telegramOnlyTitle')}</h1>
        <p className="text-sm leading-6 text-slate-300">{t('app.telegramOnlyText')}</p>
      </div>
    </div>
  );
}

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
  const authToken = useAuthStore((state) => state.token);
  const { data: meData, isLoading: isMeLoading, error: meError } = useMe();
  useMeCompletionRefresh(meData, Boolean(authToken));
  const { setLocale, t } = useI18n();
  const [telegramRuntimeAvailable] = useState(hasTelegramAuthLaunchParams);
  const [tutorialHidden, setTutorialHidden] = useState(false);
  const [tutorialOverlayDismissed, setTutorialOverlayDismissed] = useState(readTutorialOverlayDismissed);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!telegramRuntimeAvailable) return;
    login().catch(console.error);
  }, [login, telegramRuntimeAvailable]);

  useEffect(() => {
    trackFrontendEvent('client_session_started', {
      path: location.pathname,
      isTelegramEnvironment: telegramRuntimeAvailable,
    });
  }, [telegramRuntimeAvailable]);

  useEffect(() => {
    trackFrontendEvent('page_viewed', {
      path: location.pathname,
      isTelegramEnvironment: telegramRuntimeAvailable,
    });
  }, [location.pathname, telegramRuntimeAvailable]);

  useEffect(() => {
    if (!authToken || typeof document === 'undefined') return;

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        setOnlineActivityTrackingEnabled(false);
        return;
      }

      openOnlineActivitySession().catch(console.error);
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [authToken]);

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

  if (!telegramRuntimeAvailable) {
    return <TelegramOnlyScreen />;
  }

  if (authError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
        <p className="text-red-500">{t('app.authFailed', { message: authError.message })}</p>
      </div>
    );
  }

  if (meError && !meData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
        <p className="text-red-500">{t('app.loadFailed', { message: meError.message })}</p>
      </div>
    );
  }

  if (isAuthLoading || !authUser || isMeLoading || !meData) {
    return <AppLoading />;
  }

  if (!meData.playerNickname) {
    return (
      <PlayerNicknameDialog
        currentName={meData.playerNickname}
        suggestedName={meData.playerNicknameSuggestion}
        changeCount={meData.playerNicknameChangeCount}
        diamondBalance={meData.diamonds}
        required
      />
    );
  }

  const showTutorial = Boolean(meData && !meData.tutorialCompletedAt && !tutorialHidden);
  const forceOnboarding =
    showTutorial && !tutorialOverlayDismissed && location.pathname !== '/onboarding';
  if (forceOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <Suspense fallback={<AppLoading />}>
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
    </Suspense>
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
