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
      { branch: 'mining', level: 3 },
      { branch: 'sensors', level: 3 },
    ]);

    const fromOrderB = computeResearchEffects([
      { branch: 'sensors', level: 3 },
      { branch: 'mining', level: 3 },
      { branch: 'logistics', level: 1 },
      { branch: 'engineering', level: 2 },
      { branch: 'jump_drive', level: 2 },
      { branch: 'engines', level: 3 },
    ]);

    expect(fromOrderA).toEqual(fromOrderB);
    expect(fromOrderA.resourceProductionMultiplier).toBeCloseTo(1.15, 6);
    expect(fromOrderA.resourceStorageMultiplier).toBeCloseTo(1.08, 6);
    expect(fromOrderA.shipSpeedMultiplier).toBeCloseTo(1.196, 6); // 1.15 * 1.04
    expect(fromOrderA.sensorRangeMultiplier).toBeCloseTo(1.18, 6);
    expect(fromOrderA.buildTimeMultiplier).toBeCloseTo(0.94, 6);
  });

  it('applies stacked effects to resources and ships', () => {
    const effects = computeResearchEffects([
      { branch: 'mining', level: 2 },
      { branch: 'logistics', level: 3 },
      { branch: 'engines', level: 1 },
      { branch: 'sensors', level: 2 },
      { branch: 'engineering', level: 3 },
    ]);

    expect(applyProductionRate(120, effects)).toBeCloseTo(132, 6);
    expect(applyStorageCap(5000, effects)).toBeCloseTo(6200, 6);
    expect(applyShipSpeed(10, effects)).toBeCloseTo(10.5, 6);
    expect(applySensorRange(8, effects)).toBeCloseTo(8.96, 6);
    expect(applyBuildTimeSeconds(300, effects)).toBe(273);
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
