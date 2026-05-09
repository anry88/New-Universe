import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import type { User } from '@shared/types/user';

export interface StartResearchVariables {
  branch: string;
  planetId: string;
  /** Used for optimistic UI countdown (matches selected tech `timeSec`). */
  estimatedDurationSec: number;
}

export function useStartResearch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: StartResearchVariables) =>
      apiFetch<{ success: boolean; completesAt: string }>('/research/start', {
        method: 'POST',
        body: JSON.stringify({ branch: body.branch, planetId: body.planetId }),
      }),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ['me'] });
      const previous = queryClient.getQueryData<User>(['me']);
      const optimisticCompletesAt = new Date(Date.now() + vars.estimatedDurationSec * 1000).toISOString();

      queryClient.setQueryData<User>(['me'], (old) => {
        if (!old) return old;
        const research = [...(old.research ?? [])];
        const idx = research.findIndex((r) => r.branch === vars.branch);
        if (idx >= 0) {
          research[idx] = { ...research[idx], completesAt: optimisticCompletesAt };
        } else {
          research.push({
            userId: old.id,
            branch: vars.branch,
            level: 0,
            completesAt: optimisticCompletesAt,
          });
        }
        return { ...old, research };
      });

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(['me'], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });
}
