import { create } from 'zustand';
import { trackFrontendEvent } from '../lib/analytics';
import {
  apiFetch,
  openOnlineActivitySession,
  setOnlineActivityTrackingEnabled,
  setSessionToken,
} from '../lib/api';
import { persistUiLocale } from '../lib/locale';
import type { AuthResponse } from '@shared/types/auth';
import type { User } from '@shared/types/user';

interface AuthState {
  token: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: Error | null;
  login: () => Promise<void>;
  logout: () => void;
}

let loginPromise: Promise<void> | null = null;

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
  login: async () => {
    if (loginPromise) return loginPromise;

    set({ isLoading: true, error: null });
    loginPromise = (async () => {
      const response = await apiFetch<AuthResponse>('/auth/telegram', {
        method: 'POST',
      });
      setSessionToken(response.token);
      await openOnlineActivitySession();
      persistUiLocale(response.user.preferredLocale);
      trackFrontendEvent('session_authenticated', {
        locale: response.user.preferredLocale,
        tutorialCompleted: Boolean(response.user.tutorialCompletedAt),
      });
      set({
        token: response.token,
        user: response.user,
        isAuthenticated: true,
        isLoading: false,
      });
    })();

    try {
      await loginPromise;
    } catch (err) {
      setSessionToken(null);
      setOnlineActivityTrackingEnabled(false);
      set({ error: err as Error, isLoading: false });
      throw err;
    } finally {
      loginPromise = null;
    }
  },
  logout: () => {
    setSessionToken(null);
    setOnlineActivityTrackingEnabled(false);
    set({
      token: null,
      user: null,
      isAuthenticated: false,
    });
  },
}));

export function useAuth() {
  const store = useAuthStore();
  return store;
}
