import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { Ship, ShipType } from '@shared/types/ships';

export function useShipTypes() {
  return useQuery({
    queryKey: ['ship-types'],
    queryFn: () => apiFetch<ShipType[]>('/ships/types'),
  });
}

export function useBuildShip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: { planetId: string; typeSlug: string }) =>
      apiFetch<{ ship: Ship }>('/ships/build', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });
}
