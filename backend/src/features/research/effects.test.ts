import { describe, expect, it } from 'vitest';
import {
  applyBuildTimeSeconds,
  applyProductionRate,
  applySensorRange,
  applyShipSpeed,
  applyStorageCap,
  buildResearchEffectModifiers,
  computeResearchEffects,
} from './effects.js';

describe('research effects engine', () => {
  it('composes stacked research effects deterministically', () => {
    const fromOrderA = computeResearchEffects([
      { branch: 'engines', level: 3 },
      { branch: 'jump_drive', level: 2 },
      { branch: 'engineering', level: 2 },
      { branch: 'logistics', level: 1 },
      { branch: 'mining', level: 4 },
      { branch: 'sensors', level: 5 },
    ]);

    const fromOrderB = computeResearchEffects([
      { branch: 'sensors', level: 5 },
      { branch: 'mining', level: 4 },
      { branch: 'logistics', level: 1 },
      { branch: 'engineering', level: 2 },
      { branch: 'jump_drive', level: 2 },
      { branch: 'engines', level: 3 },
    ]);

    expect(fromOrderA).toEqual(fromOrderB);
    expect(fromOrderA.resourceProductionMultiplier).toBeCloseTo(1.2, 6);
    expect(fromOrderA.resourceStorageMultiplier).toBeCloseTo(1.1, 6);
    expect(fromOrderA.shipSpeedMultiplier).toBeCloseTo(1.2826, 4); // 1.21 * 1.06
    expect(fromOrderA.sensorRangeMultiplier).toBeCloseTo(1.4, 6);
    expect(fromOrderA.buildTimeMultiplier).toBeCloseTo(0.92, 6);
  });

  it('applies stacked effects to resources and ships', () => {
    const effects = computeResearchEffects([
      { branch: 'mining', level: 2 },
      { branch: 'logistics', level: 3 },
      { branch: 'engines', level: 1 },
      { branch: 'sensors', level: 2 },
      { branch: 'engineering', level: 4 },
    ]);

    expect(applyProductionRate(120, effects)).toBeCloseTo(132, 6);
    expect(applyStorageCap(5000, effects)).toBeCloseTo(6500, 6);
    expect(applyShipSpeed(10, effects)).toBeCloseTo(10.7, 6);
    expect(applySensorRange(8, effects)).toBeCloseTo(9.28, 6);
    expect(applyBuildTimeSeconds(300, effects)).toBe(252);
  });

  it('keeps unknown branches from mutating effects', () => {
    const modifiers = buildResearchEffectModifiers([
      { branch: 'unknown_branch', level: 10 },
      { branch: 'mining', level: 1 },
    ]);
    expect(modifiers).toHaveLength(1);
    expect(modifiers[0].target).toBe('resourceProduction');
  });
});
