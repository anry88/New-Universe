import { describe, expect, it } from 'vitest';
import { RESOURCE_ENTITY_LABELS } from '@shared/types/entity-labels';
import { calculateRegen, getResourceLabel, getResourceSymbol, RESOURCE_ICON_IDS } from './resources';

const NON_GAMEPLAY_RESOURCE_LABELS = new Set(['metal', 'solid_mineral', 'gas', 'oil_or_methane', 'water_or_biomass']);

describe('resource icon resolver', () => {
  it('backs every gameplay resource label with a Cosmic Atlas icon', () => {
    const gameplayResourceIds = Object.keys(RESOURCE_ENTITY_LABELS)
      .filter((resourceId) => !NON_GAMEPLAY_RESOURCE_LABELS.has(resourceId))
      .sort();

    expect([...RESOURCE_ICON_IDS].sort()).toEqual(gameplayResourceIds);
  });

  it('does not expose chemistry abbreviations as resource symbols', () => {
    for (const resourceId of RESOURCE_ICON_IDS) {
      expect(getResourceSymbol(resourceId)).not.toMatch(/[A-Za-z0-9]/);
    }
  });

  it('uses real material names for starter military resources', () => {
    expect(getResourceLabel('military_alloy', 'en')).toBe('Silver Steel');
    expect(getResourceLabel('military_alloy', 'ru')).toBe('Серебряная сталь');
    expect(getResourceLabel('military_composite', 'en')).toBe('C/SiC Composite');
    expect(getResourceLabel('military_composite', 'ru')).toBe('C/SiC-композит');
  });
});

describe('calculateRegen', () => {
  it('correctly increments amount based on regen rate per hour', () => {
    // regenRate = 60/h -> 1/min -> 0.01666.../sec
    const currentAmount = 100;
    const regenRatePerHour = 60;
    const deltaSeconds = 1;
    const storageCap = 1000;

    const result = calculateRegen(currentAmount, regenRatePerHour, deltaSeconds, storageCap);

    // 100 + (60/3600) * 1 = 100 + 0.016666...
    expect(result).toBeCloseTo(100.0167, 4);
  });

  it('respects storage capacity', () => {
    const currentAmount = 999.99;
    const regenRatePerHour = 3600; // 1 per second
    const deltaSeconds = 10;
    const storageCap = 1000;

    const result = calculateRegen(currentAmount, regenRatePerHour, deltaSeconds, storageCap);
    expect(result).toBe(1000);
  });
});
