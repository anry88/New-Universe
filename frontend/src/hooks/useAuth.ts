import { create } from 'zustand';
import { apiFetch, setSessionToken } from '../lib/api';
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

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
  login: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiFetch<AuthResponse>('/auth/telegram', {
        method: 'POST',
      });
      setSessionToken(response.token);
      set({
        token: response.token,
        user: response.user,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (err) {
      set({ error: err as Error, isLoading: false });
      throw err;
    }
  },
  logout: () => {
    setSessionToken(null);
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
