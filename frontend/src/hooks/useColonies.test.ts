import { describe, expect, it, beforeEach } from 'vitest';
import { useColoniesStore } from './useColonies';

describe('useColoniesStore (focal planet)', () => {
  beforeEach(() => {
    useColoniesStore.setState({ focalPlanetId: null });
  });

  it('updates focal planet id when switching selection (home rail)', () => {
    useColoniesStore.getState().setFocalPlanetId('p-first');
    expect(useColoniesStore.getState().focalPlanetId).toBe('p-first');

    useColoniesStore.getState().setFocalPlanetId('p-other');
    expect(useColoniesStore.getState().focalPlanetId).toBe('p-other');
  });
});
