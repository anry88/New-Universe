import { useEffect, useMemo } from 'react';
import { useSignal, themeParams, useLaunchParams } from '@telegram-apps/sdk-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from './hooks/useAuth';
import { useMe } from './hooks/useMe';

const queryClient = new QueryClient();

function AppContent() {
  const lp = useLaunchParams();
  const tp = useSignal(themeParams.state);
  const isDark = useSignal(themeParams.isDark);
  const { login, isLoading: isAuthLoading, error: authError, user: authUser } = useAuth();
  const { data: meUser } = useMe();

  useEffect(() => {
    login().catch(console.error);
  }, [login]);

  const user = meUser || authUser;
  const tgUser = lp?.initData?.user;
  const username = user?.tgUsername || tgUser?.username || user?.tgFirstName || tgUser?.firstName || 'DevUser';
  const powerScore = meUser?.powerScore ?? 0;

  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4 transition-colors duration-300"
      style={{
        backgroundColor: tp?.backgroundColor || (isDark ? '#0f172a' : '#f8fafc'),
        color: tp?.textColor || (isDark ? '#f8fafc' : '#0f172a'),
      }}
    >
      <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-xl max-w-sm w-full text-center border border-slate-200 dark:border-slate-700">
        <h1 className="text-3xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
          New Universe
        </h1>
        <p className="text-xl font-medium mb-6">
          Hello, <span className="text-blue-500">{username}</span>!
        </p>
        
        {meUser && (
          <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800/50">
            <p className="text-sm opacity-70 mb-1">Power Score</p>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{powerScore}</p>
          </div>
        )}

        <div className="space-y-3">
          <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg text-sm flex justify-between">
            <span className="opacity-70">Platform</span>
            <span className="font-mono">{lp?.platform || 'Web Browser'}</span>
          </div>
          <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg text-sm flex justify-between">
            <span className="opacity-70">Theme</span>
            <span className="font-mono">{isDark ? 'Dark' : 'Light'}</span>
          </div>
        </div>

        {authError && (
          <p className="mt-4 text-red-500 text-sm">
            Auth failed: {authError.message}
          </p>
        )}

        <button
          className="mt-8 w-full py-3 px-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all active:scale-95 shadow-lg shadow-blue-200 dark:shadow-none"
          onClick={() => alert('Welcome to the Universe!')}
        >
          Enter the Game
        </button>
      </div>
      <p className="mt-8 text-slate-400 text-xs uppercase tracking-widest font-semibold">
        Stellar Forge Project
      </p>
    </div>
  );
}

function App() {
  const queryClientInstance = useMemo(() => queryClient, []);
  
  return (
    <QueryClientProvider client={queryClientInstance}>
      <AppContent />
    </QueryClientProvider>
  );
}

export default App;
