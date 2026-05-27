import { useQuery } from '@tanstack/react-query';
import type { PlanetResource } from '@shared/types/world';
import { apiFetch } from '../lib/api';
import { planetInventoryApiPath } from '../lib/resourceBarScope';

export const planetResourcesQueryKey = (planetId: string | null | undefined) =>
  ['planet-resources', planetId ?? 'none'] as const;

export function usePlanetResources(planetId: string | null | undefined) {
  return useQuery({
    queryKey: planetResourcesQueryKey(planetId),
    queryFn: () =>
      apiFetch<{ resources: PlanetResource[] }>(planetInventoryApiPath(planetId!)).then(
        (response) => response.resources,
      ),
    enabled: Boolean(planetId),
    staleTime: 5_000,
    refetchOnWindowFocus: true,
  });
}
