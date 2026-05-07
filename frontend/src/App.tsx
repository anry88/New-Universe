import { useEffect } from 'react';
import { useAuth } from './hooks/useAuth';
import { HomePage } from './pages/Home';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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
  
  return <HomePage />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}

export default App;
