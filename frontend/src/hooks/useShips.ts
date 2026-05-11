import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import { RushShipBuildResponse, Ship, ShipQueueItem, ShipType } from '@shared/types/ships';

const MAX_TIMEOUT_MS = 2_147_483_647;

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
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['ship-queue'],
    queryFn: () => apiFetch<{ queue: ShipQueueItem[] }>('/ships/queue'),
    refetchInterval: false,
  });

  useEffect(() => {
    const nextDue = (query.data?.queue ?? [])
      .map((item) => new Date(item.queueCompletesAt).getTime())
      .filter((ms) => Number.isFinite(ms))
      .sort((a, b) => a - b)[0];
    if (nextDue == null) return;

    const delay = Math.min(
      Math.max(0, nextDue - Date.now()) + 250,
      MAX_TIMEOUT_MS,
    );
    const id = window.setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['ship-queue'] });
      queryClient.invalidateQueries({ queryKey: ['me'] });
    }, delay);
    return () => window.clearTimeout(id);
  }, [query.data, queryClient]);

  return query;
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
