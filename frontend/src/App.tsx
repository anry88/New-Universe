import { useSignal, themeParams, useLaunchParams } from '@telegram-apps/sdk-react';

function App() {
  const lp = useLaunchParams();
  const tp = useSignal(themeParams.state);
  const isDark = useSignal(themeParams.isDark);

  const user = lp?.initData?.user;
  const username = user?.username || user?.firstName || 'DevUser';

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
        <div className="space-y-3">
          <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg text-sm">
            <p className="opacity-70">Platform</p>
            <p className="font-mono">{lp?.platform || 'Web Browser'}</p>
          </div>
          <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg text-sm">
            <p className="opacity-70">Theme</p>
            <p className="font-mono">{isDark ? 'Dark' : 'Light'}</p>
          </div>
        </div>
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

export default App;
