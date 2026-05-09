import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import type { User } from '@shared/types/user';
import { useAuthStore } from './useAuth';

export function useMe() {
  const token = useAuthStore((state) => state.token);
  
  return useQuery({
    queryKey: ['me'],
    queryFn: () => apiFetch<{ user: User }>('/me').then(res => res.user),
    enabled: !!token,
    staleTime: 10 * 1000,
    refetchOnWindowFocus: true,
  });
}
