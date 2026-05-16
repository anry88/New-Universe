import { create } from 'zustand';
import { useMe } from './useMe';
import { useEffect } from 'react';

interface ColoniesState {
  focalPlanetId: string | null;
  setFocalPlanetId: (id: string) => void;
}

export const useColoniesStore = create<ColoniesState>((set) => ({
  focalPlanetId: null,
  setFocalPlanetId: (id) => set({ focalPlanetId: id }),
}));

/**
 * Hook to manage owned planets and the currently focused planet.
 */
export function useColonies() {
  const { data: meData, isLoading, refetch } = useMe();
  const { focalPlanetId, setFocalPlanetId } = useColoniesStore();

  // Initialize focal planet if not set. Strict `=== true` so that any planet without
  // an explicit colonized flag (e.g. mid-refetch optimistic snapshots) does not get
  // surfaced on Home/Colonies as a buildable settlement.
  useEffect(() => {
    const settledPlanets =
      meData?.planets?.filter((planet) => planet.isColonized === true) ?? [];
    if (settledPlanets.length > 0 && !focalPlanetId) {
      setFocalPlanetId(settledPlanets[0].id);
    }
  }, [meData?.planets, focalPlanetId, setFocalPlanetId]);

  const planets = (meData?.planets || []).filter(
    (planet) => planet.isDiscovered !== false && planet.isColonized === true,
  );
  const focalPlanet = planets.find((p) => p.id === focalPlanetId) || planets[0] || null;

  return {
    planets,
    focalPlanet,
    focalPlanetId: focalPlanet?.id || null,
    setFocalPlanetId,
    isLoading,
    refetch,
  };
}
