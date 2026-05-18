import { describe, expect, it } from 'vitest';
import type { Expedition } from '@shared/types/expeditions';
import type { HomeSystem } from '@shared/types/world';
import { buildExpeditionTrailSegments } from './SystemMap';

const system: HomeSystem = {
  id: 'public-system',
  ownerId: '',
  isHome: false,
  sectorX: 10,
  sectorY: 20,
  sectorZ: 0,
  name: 'Public System',
  seed: 1,
  planets: [],
};

function expedition(overrides: Partial<Expedition>): Expedition {
  return {
    id: 'expedition-1',
    shipId: 'ship-1',
    type: 'light_fighter',
    originPlanetId: 'origin-planet',
    targetX: 10,
    targetY: 20,
    targetZ: 0,
    targetPlanetId: null,
    status: 'in_flight',
    eta: '2026-05-13T01:00:00.000Z',
    returnedAt: null,
    result: {
      routeMode: 'jump_gate',
      destinationSystemId: system.id,
      targetSystemPoint: { x: 72, y: -24 },
    },
    ...overrides,
  };
}

describe('buildExpeditionTrailSegments', () => {
  it('does not keep a previous route trail for stationed point deployments', () => {
    const segments = buildExpeditionTrailSegments(
      [expedition({ status: 'stationed' })],
      new Map(),
      system,
    );

    expect(segments).toEqual([]);
  });

  it('keeps active route trails for in-flight point deployments', () => {
    const segments = buildExpeditionTrailSegments(
      [expedition({ status: 'in_flight' })],
      new Map(),
      system,
    );

    expect(segments).toEqual([
      expect.objectContaining({
        id: 'expedition-1-destination',
        endpointX: 72,
        endpointY: -24,
      }),
    ]);
  });
});
