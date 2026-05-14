import { describe, expect, it } from 'vitest';

import { MAX_BUILDING_LEVEL, HIGH_TIER_UPGRADE_COSTS_BY_BUILDING } from '@shared/config/buildingUpgradeEconomy.js';
import { EXTRACTABLE_RESOURCE_RATES_PER_HOUR } from '@shared/config/resourceExtractionRates.js';
import { PRODUCTION_RECIPES } from '@shared/config/productionRecipes.js';
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
    expect(resourceRates.get('oxygen')).toBe(EXTRACTABLE_RESOURCE_RATES_PER_HOUR.oxygen);
    expect(resourceRates.get('hydrogen')).toBe(EXTRACTABLE_RESOURCE_RATES_PER_HOUR.hydrogen);
    expect(resourceRates.get('nitrogen')).toBe(EXTRACTABLE_RESOURCE_RATES_PER_HOUR.nitrogen);
    expect(resourceRates.get('silver')).toBe(EXTRACTABLE_RESOURCE_RATES_PER_HOUR.silver);
    expect(resourceRates.get('gold')).toBe(EXTRACTABLE_RESOURCE_RATES_PER_HOUR.gold);
    expect(resourceRates.get('iron')).toBeGreaterThan(resourceRates.get('silicon') ?? 0);
  });

  it('keeps P2.2-015 extractor catalog defaults aligned with new deposit roles', () => {
    const drill = BUILDING_TYPE_CATALOG_ROWS.find((building) => building.id === 'drill');
    const oilPump = BUILDING_TYPE_CATALOG_ROWS.find((building) => building.id === 'oil_pump');
    const bioreactor = BUILDING_TYPE_CATALOG_ROWS.find((building) => building.id === 'biomass_harvester');

    expect(drill).toBeDefined();
    expect(oilPump).toBeDefined();
    expect(bioreactor).toBeDefined();
    expect(drill!.name.en).toBe('Gas Extractor');
    expect(drill!.baseOutput).toMatchObject({ resourceId: 'methane' });
    expect(oilPump!.description!.en).toContain('oil or methane');
    expect(bioreactor!.name.en).toBe('Bioreactor');
    expect(bioreactor!.description!.en).toContain('water');
  });

  it('keeps player-facing catalog names and descriptions free of task or implementation metadata', () => {
    const metaPattern = /\b(P\d(?:\.\d)?-\d+|task-id|task|slug|proxy|server|internal|technical)\b/i;
    const texts = [
      ...RESOURCE_CATALOG_ROWS.flatMap((row) => [row.name.en, row.name.ru]),
      ...BUILDING_TYPE_CATALOG_ROWS.flatMap((row) => [
        row.name.en,
        row.name.ru,
        row.description?.en ?? '',
        row.description?.ru ?? '',
      ]),
      ...SHIP_TYPE_CATALOG_ROWS.flatMap((row) => [row.name.en, row.name.ru]),
    ];

    for (const text of texts) {
      expect(text).not.toMatch(metaPattern);
    }
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

  it('keeps silicon carbide as an expensive manufactured material', () => {
    const recipe = PRODUCTION_RECIPES.find((row) => row.id === 'silicon_carbide_from_silicon_carbon');
    const resource = RESOURCE_CATALOG_ROWS.find((row) => row.id === 'silicon_carbide');

    expect(resource?.baseRegenRate).toBe(0);
    expect(recipe).toBeDefined();
    expect(recipe!.buildingTypeId).toBe('fabrication_bay');
    expect(recipe!.output).toEqual({ resourceId: 'silicon_carbide', amount: 1 });
    expect(recipe!.inputs).toEqual([
      { resourceId: 'silicon', amount: 24 },
      { resourceId: 'carbon', amount: 16 },
      { resourceId: 'steel', amount: 2 },
    ]);
    expect(recipe!.baseDurationSec).toBeGreaterThanOrEqual(180);
  });

  it('unlocks the shipyard after a level 1 spaceport', () => {
    const shipyard = BUILDING_TYPE_CATALOG_ROWS.find((building) => building.id === 'shipyard');
    expect(shipyard).toBeDefined();
    expect(shipyard!.deps).toEqual([{ typeId: 'spaceport', level: 1 }]);
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

  it('keeps active ship catalog ids aligned with Jump Gate semantics', () => {
    expect(SHIP_TYPE_CATALOG_ROWS.map((ship) => ship.id)).toEqual([
      'scout',
      'cargo_light',
      'colonizer',
      'recon_probe',
    ]);
    const reconProbe = SHIP_TYPE_CATALOG_ROWS.find((ship) => ship.id === 'recon_probe');
    expect(reconProbe).toBeDefined();
    expect(reconProbe!.name).toMatchObject({
      en: 'Recon Probe',
      ru: 'Разведывательный зонд',
    });
    expect(reconProbe!.role).toBe('exploration');
    expect(reconProbe!.cargo).toBe(0);
  });
});
