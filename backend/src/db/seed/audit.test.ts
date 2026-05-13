import { describe, expect, it } from 'vitest';

import { MAX_BUILDING_LEVEL, HIGH_TIER_UPGRADE_COSTS_BY_BUILDING } from '@shared/config/buildingUpgradeEconomy.js';
import { EXTRACTABLE_RESOURCE_RATES_PER_HOUR } from '@shared/config/resourceExtractionRates.js';
import { runCatalogAudit } from './audit.js';
import { BUILDING_TYPE_CATALOG_ROWS, RESOURCE_CATALOG_ROWS, SHIP_TYPE_CATALOG_ROWS } from './catalog-rows.js';

describe('catalog seed audit (P2-POL-002)', () => {
  it('passes without drift across resources, buildings, ships, research, and production recipes', () => {
    const result = runCatalogAudit();
    expect(result.errors, result.errors.join('\n')).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('keeps building caps and extraction rates aligned with shared balance constants', () => {
    expect(BUILDING_TYPE_CATALOG_ROWS.every((row) => row.maxLevel === MAX_BUILDING_LEVEL)).toBe(true);

    const resourceRates = new Map(RESOURCE_CATALOG_ROWS.map((row) => [row.id, row.baseRegenRate]));
    expect(resourceRates.get('iron')).toBe(EXTRACTABLE_RESOURCE_RATES_PER_HOUR.iron);
    expect(resourceRates.get('silicon')).toBe(EXTRACTABLE_RESOURCE_RATES_PER_HOUR.silicon);
    expect(resourceRates.get('iron')).toBeGreaterThan(resourceRates.get('silicon') ?? 0);
  });

  it('keeps high-tier ship infrastructure costs realistic', () => {
    expect(HIGH_TIER_UPGRADE_COSTS_BY_BUILDING.spaceport).toMatchObject({
      aluminum: expect.any(Number),
      steel: expect.any(Number),
      titanium: expect.any(Number),
    });
    expect(HIGH_TIER_UPGRADE_COSTS_BY_BUILDING.spaceport).not.toHaveProperty('biomass');
    expect(HIGH_TIER_UPGRADE_COSTS_BY_BUILDING.shipyard).not.toHaveProperty('biomass');
  });

  it('keeps cargo_light aligned with P2.2 lightweight transporter balance', () => {
    const cargoLight = SHIP_TYPE_CATALOG_ROWS.find((ship) => ship.id === 'cargo_light');
    expect(cargoLight).toBeDefined();
    expect(cargoLight!.cargo).toBe(5000);
    expect(cargoLight!.requiredBuildings).toEqual([{ typeId: 'shipyard', level: 2 }]);
    expect(cargoLight!.buildCost).not.toHaveProperty('aluminum');
    expect(cargoLight!.buildCost).not.toHaveProperty('electronics');
    expect(Object.keys(cargoLight!.buildCost)).toEqual([
      'iron',
      'silicon',
      'carbon',
      'methane',
    ]);
  });
});
