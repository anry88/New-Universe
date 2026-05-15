import { describe, it, expect } from 'vitest';
import { deriveBuildingMaxHp, deriveShipMaxHp } from './durability.js';
import { BUILDING_TYPE_CATALOG_ROWS, SHIP_TYPE_CATALOG_ROWS } from '../../db/seed/catalog-rows.js';
import { COMMAND_CENTER_TYPE_ID } from '@shared/config/buildingUpgradeEconomy.js';

describe('combat durability baseline', () => {
  it('derives building max HP scaled by level', () => {
    expect(deriveBuildingMaxHp(1000, 1)).toBe(1000);
    expect(deriveBuildingMaxHp(1000, 5)).toBe(5000);
  });

  it('derives ship max HP', () => {
    expect(deriveShipMaxHp(40)).toBe(40);
    expect(deriveShipMaxHp(undefined)).toBe(100);
  });

  it('validates building catalog combat stats', () => {
    const cc = BUILDING_TYPE_CATALOG_ROWS.find(r => r.id === COMMAND_CENTER_TYPE_ID);
    expect(cc).toBeDefined();
    expect(cc?.combatStats?.targetClass).toBe('command_center');

    const others = BUILDING_TYPE_CATALOG_ROWS.filter(r => r.id !== COMMAND_CENTER_TYPE_ID);
    for (const b of others) {
      if (b.combatStats) {
        expect(b.combatStats.targetClass).toBe('building');
      }
    }
  });

  it('validates ship catalog combat stats', () => {
    for (const ship of SHIP_TYPE_CATALOG_ROWS) {
      expect(ship.combatStats).toBeDefined();
      expect(['civilian', 'military_light', 'military_medium', 'military_heavy']).toContain(ship.combatStats?.targetClass);
    }
  });

  it('scales medium and heavy combat lines from light hulls', () => {
    const byId = new Map(SHIP_TYPE_CATALOG_ROWS.map((ship) => [ship.id, ship]));
    const lines = [
      ['light_fighter', 'medium_fighter', 'heavy_fighter'],
      ['light_bomber', 'medium_bomber', 'heavy_bomber'],
      ['light_laser', 'medium_laser', 'heavy_laser'],
    ] as const;

    for (const [lightId, mediumId, heavyId] of lines) {
      const light = byId.get(lightId)!;
      const medium = byId.get(mediumId)!;
      const heavy = byId.get(heavyId)!;

      expect(medium.hp).toBeGreaterThan(light.hp);
      expect(heavy.hp).toBeGreaterThan(medium.hp);
      expect(medium.dps ?? 0).toBeGreaterThan(light.dps ?? 0);
      expect(heavy.dps ?? 0).toBeGreaterThan(medium.dps ?? 0);
      expect(medium.fuelCapacity ?? 0).toBeGreaterThan(light.fuelCapacity ?? 0);
      expect(heavy.fuelCapacity ?? 0).toBeGreaterThan(medium.fuelCapacity ?? 0);
      expect(medium.buildTimeSec).toBeGreaterThan(light.buildTimeSec);
      expect(heavy.buildTimeSec).toBeGreaterThan(medium.buildTimeSec);
    }
  });
});
