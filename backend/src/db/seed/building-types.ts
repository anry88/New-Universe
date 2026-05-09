import { db } from '../index.js';
import { buildingTypes } from '../schema/buildings.js';
import { BUILDING_TYPE_CATALOG_ROWS } from './catalog-rows.js';

export async function seedBuildingTypes() {
  console.log('Seeding building types...');
  for (const row of BUILDING_TYPE_CATALOG_ROWS) {
    await db.insert(buildingTypes).values(row).onConflictDoUpdate({
      target: buildingTypes.id,
      set: row,
    });
  }
}
