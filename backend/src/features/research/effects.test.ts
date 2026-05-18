import { describe, expect, it } from 'vitest';
import {
  applyBuildTimeSeconds,
  applyEnergyGeneration,
  applyEnergyRequirement,
  applyEnergyStorage,
  applyProductionRate,
  applySensorRange,
  applyShipSpeed,
  applyStorageCap,
  applyWeaponRange,
  buildResearchEffectModifiers,
  computeResearchEffects,
  createResearchEffectsRequestCache,
  getResearchEffectsForUser,
  invalidateResearchEffectsCache,
} from './effects.js';

describe('research effects engine', () => {
  it('composes stacked research effects deterministically', () => {
    const fromOrderA = computeResearchEffects([
      { branch: 'engines', level: 3 },
      { branch: 'jump_drive', level: 2 },
      { branch: 'engineering', level: 2 },
      { branch: 'energy', level: 3 },
      { branch: 'logistics', level: 1 },
      { branch: 'mining', level: 3 },
      { branch: 'sensors', level: 3 },
      { branch: 'weapons', level: 3 },
    ]);

    const fromOrderB = computeResearchEffects([
      { branch: 'sensors', level: 3 },
      { branch: 'mining', level: 3 },
      { branch: 'logistics', level: 1 },
      { branch: 'energy', level: 3 },
      { branch: 'engineering', level: 2 },
      { branch: 'jump_drive', level: 2 },
      { branch: 'engines', level: 3 },
      { branch: 'weapons', level: 3 },
    ]);

    expect(fromOrderA).toEqual(fromOrderB);
    expect(fromOrderA.resourceProductionMultiplier).toBeCloseTo(1.15, 6);
    expect(fromOrderA.resourceStorageMultiplier).toBeCloseTo(1.08, 6);
    expect(fromOrderA.energyGenerationMultiplier).toBeCloseTo(1.18, 6);
    expect(fromOrderA.energyStorageMultiplier).toBeCloseTo(1.25, 6);
    expect(fromOrderA.energyEfficiencyMultiplier).toBeCloseTo(0.92, 6);
    expect(fromOrderA.shipSpeedMultiplier).toBeCloseTo(1.196, 6); // 1.15 * 1.04
    expect(fromOrderA.sensorRangeMultiplier).toBeCloseTo(1.18, 6);
    expect(fromOrderA.weaponRangeMultiplier).toBeCloseTo(1.18, 6);
    expect(fromOrderA.buildTimeMultiplier).toBeCloseTo(0.94, 6);
  });

  it('applies stacked effects to resources and ships', () => {
    const effects = computeResearchEffects([
      { branch: 'mining', level: 2 },
      { branch: 'logistics', level: 3 },
      { branch: 'energy', level: 4 },
      { branch: 'engines', level: 1 },
      { branch: 'sensors', level: 2 },
      { branch: 'weapons', level: 2 },
      { branch: 'engineering', level: 3 },
    ]);

    expect(applyProductionRate(120, effects)).toBeCloseTo(132, 6);
    expect(applyStorageCap(5000, effects)).toBeCloseTo(6200, 6);
    expect(applyEnergyGeneration(50, effects)).toBeCloseTo(62, 6);
    expect(applyEnergyStorage(500, effects)).toBeCloseTo(675, 6);
    expect(applyEnergyRequirement(100, effects)).toBeCloseTo(87, 6);
    expect(applyShipSpeed(10, effects)).toBeCloseTo(10.5, 6);
    expect(applySensorRange(8, effects)).toBeCloseTo(8.96, 6);
    expect(applyWeaponRange(2.2, effects)).toBeCloseTo(2.464, 6);
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

  it('memoizes research effects within one request cache and invalidates on demand', async () => {
    let queryCount = 0;
    let rows = [{ branch: 'mining', level: 1 }];
    const database = {
      query: {
        researchProgress: {
          findMany: async () => {
            queryCount += 1;
            return rows;
          },
        },
      },
    };
    const cache = createResearchEffectsRequestCache();

    const first = await getResearchEffectsForUser('user-cache', database, cache);
    const second = await getResearchEffectsForUser('user-cache', database, cache);

    expect(second).toEqual(first);
    expect(queryCount).toBe(1);

    rows = [{ branch: 'mining', level: 2 }];
    invalidateResearchEffectsCache('user-cache', cache);
    const afterInvalidation = await getResearchEffectsForUser('user-cache', database, cache);

    expect(queryCount).toBe(2);
    expect(afterInvalidation.resourceProductionMultiplier).toBeGreaterThan(first.resourceProductionMultiplier);
  });
});
