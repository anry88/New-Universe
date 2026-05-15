import { describe, it, expect } from 'vitest';
import {
  resolveInsufficientResourcesBlockedReason,
  resolveQueueFullBlockedReason,
} from './build-eligibility';

describe('resolveQueueFullBlockedReason', () => {
  it('returns null when no building on the planet is queued', () => {
    const reason = resolveQueueFullBlockedReason({
      planetId: 'planet-1',
      planetBuildings: [
        { queueAction: undefined },
        { queueAction: undefined },
      ],
    });
    expect(reason).toBeNull();
  });

  it('returns building_blocked_queue_full when a build is in flight', () => {
    const reason = resolveQueueFullBlockedReason({
      planetId: 'planet-1',
      planetBuildings: [{ queueAction: 'build' }],
    });
    expect(reason).toEqual({
      code: 'building_blocked_queue_full',
      details: { planetId: 'planet-1' },
    });
  });

  it('returns building_blocked_queue_full when an upgrade is in flight', () => {
    const reason = resolveQueueFullBlockedReason({
      planetId: 'planet-1',
      planetBuildings: [
        { queueAction: undefined },
        { queueAction: 'upgrade' },
      ],
    });
    expect(reason).toEqual({
      code: 'building_blocked_queue_full',
      details: { planetId: 'planet-1' },
    });
  });

  it('handles missing planet id gracefully', () => {
    const reason = resolveQueueFullBlockedReason({
      planetBuildings: [{ queueAction: 'build' }],
    });
    expect(reason).toEqual({
      code: 'building_blocked_queue_full',
      details: {},
    });
  });
});

describe('resolveInsufficientResourcesBlockedReason', () => {
  it('returns null when every cost is covered', () => {
    const reason = resolveInsufficientResourcesBlockedReason({
      costs: { iron: 100, copper: 50 },
      planetResources: [
        { resourceId: 'iron', amount: 150 },
        { resourceId: 'copper', amount: '50.99' },
      ],
    });
    expect(reason).toBeNull();
  });

  it('lists every missing resource with required and available amounts', () => {
    const reason = resolveInsufficientResourcesBlockedReason({
      costs: { iron: 100, copper: 50, gold: 10 },
      planetResources: [
        { resourceId: 'iron', amount: 40 },
        { resourceId: 'copper', amount: 49.9 },
      ],
    });
    expect(reason).toEqual({
      code: 'building_blocked_insufficient_resources',
      details: {
        missing: [
          { resourceId: 'iron', required: 100, available: 40 },
          { resourceId: 'copper', required: 50, available: 49 },
          { resourceId: 'gold', required: 10, available: 0 },
        ],
      },
    });
  });

  it('ignores zero-cost entries', () => {
    const reason = resolveInsufficientResourcesBlockedReason({
      costs: { iron: 0 },
      planetResources: [],
    });
    expect(reason).toBeNull();
  });

  it('treats missing planet resources as zero', () => {
    const reason = resolveInsufficientResourcesBlockedReason({
      costs: { iron: 5 },
      planetResources: undefined,
    });
    expect(reason).toEqual({
      code: 'building_blocked_insufficient_resources',
      details: {
        missing: [{ resourceId: 'iron', required: 5, available: 0 }],
      },
    });
  });
});
