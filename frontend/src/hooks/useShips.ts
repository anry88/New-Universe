import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../lib/api';
import type { User } from '@shared/types/user';
import type { BuildShipResponse, RushShipBuildResponse, Ship, ShipQueueItem, ShipType } from '@shared/types/ships';
import type { RefuelRequest, RefuelResponse } from '@shared/types/refuel';

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
    mutationFn: (body: { planetId: string; typeSlug: string; estimatedDurationSec?: number }) =>
      apiFetch<BuildShipResponse>('/ships/build', {
        method: 'POST',
        body: JSON.stringify({
          planetId: body.planetId,
          typeSlug: body.typeSlug,
        }),
      }),
    onMutate: async (vars) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ['me'] }),
        queryClient.cancelQueries({ queryKey: ['ship-queue'] }),
      ]);
      const previousMe = queryClient.getQueryData<User>(['me']);
      const previousQueue = queryClient.getQueryData<{ queue: ShipQueueItem[] }>(['ship-queue']);
      const tempId = `temp-ship-${Date.now()}`;
      const startedAt = new Date().toISOString();
      const completesAt = new Date(
        Date.now() + Math.max(0, vars.estimatedDurationSec ?? 0) * 1000,
      ).toISOString();
      const optimisticShip: Ship = {
        id: tempId,
        ownerId: previousMe?.id ?? 'optimistic',
        typeId: vars.typeSlug,
        locationPlanetId: vars.planetId,
        status: 'building',
        queueCompletesAt: completesAt,
        queueStartedAt: startedAt,
        cargoJson: {},
        fuel: '0',
        jumpFuel: '0',
        hp: 1,
        maxHp: 1,
        combatStats: { targetClass: 'civilian' },
      };
      const optimisticQueueItem: ShipQueueItem = {
        id: tempId,
        planetId: vars.planetId,
        typeId: vars.typeSlug,
        status: 'building',
        queueCompletesAt: completesAt,
        queueStartedAt: startedAt,
      };

      queryClient.setQueryData<User>(['me'], (old) =>
        old ? { ...old, ships: [...(old.ships ?? []), optimisticShip] } : old,
      );
      queryClient.setQueryData<{ queue: ShipQueueItem[] }>(['ship-queue'], (old) => ({
        queue: [...(old?.queue ?? []), optimisticQueueItem],
      }));

      return { previousMe, previousQueue, tempId };
    },
    onSuccess: (data, _vars, context) => {
      if (context?.tempId && data.ship) {
        queryClient.setQueryData<User>(['me'], (old) => {
          if (!old) return old;
          return {
            ...old,
            ships: (old.ships ?? []).map((ship) =>
              ship.id === context.tempId ? data.ship : ship,
            ),
          };
        });
      }
      if (context?.tempId && data.queueItem) {
        queryClient.setQueryData<{ queue: ShipQueueItem[] }>(['ship-queue'], (old) => ({
          queue: (old?.queue ?? []).map((item) =>
            item.id === context.tempId ? data.queueItem! : item,
          ),
        }));
      }
    },
    onError: (_err, _vars, context) => {
      if (context?.previousMe !== undefined) {
        queryClient.setQueryData(['me'], context.previousMe);
      }
      queryClient.setQueryData(['ship-queue'], context?.previousQueue ?? { queue: [] });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] });
      queryClient.invalidateQueries({ queryKey: ['ship-queue'] });
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

export function useRefuel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: RefuelRequest) =>
      apiFetch<RefuelResponse>('/ships/refuel', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });
}
