import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { RushShipBuildResponse, Ship, ShipQueueItem, ShipType } from '@shared/types/ships';

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

export function useShipQueue() {
  return useQuery({
    queryKey: ['ship-queue'],
    queryFn: () => apiFetch<{ queue: ShipQueueItem[] }>('/ships/queue'),
    refetchInterval: 1000,
  });
}

export function useRushShip() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (shipId: string) =>
      apiFetch<RushShipBuildResponse>('/ships/rush', {
        method: 'POST',
        body: JSON.stringify({ shipId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] });
      queryClient.invalidateQueries({ queryKey: ['ship-queue'] });
    },
  });
}
