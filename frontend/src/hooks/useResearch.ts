import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';

export function useStartResearch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: { branch: string; planetId: string }) =>
      apiFetch<{ success: boolean; completesAt: string }>('/research/start', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });
}
