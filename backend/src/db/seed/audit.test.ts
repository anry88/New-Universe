import { describe, expect, it } from 'vitest';

import { runCatalogAudit } from './audit.js';
import { SHIP_TYPE_CATALOG_ROWS } from './catalog-rows.js';

describe('catalog seed audit (P2-POL-002)', () => {
  it('passes without drift across resources, buildings, ships, research, and market price keys', () => {
    const result = runCatalogAudit();
    expect(result.errors, result.errors.join('\n')).toEqual([]);
    expect(result.ok).toBe(true);
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
