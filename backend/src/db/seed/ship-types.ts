import { db } from '../index.js';
import { shipTypes } from '../schema/ships.js';
import { SHIP_TYPE_CATALOG_ROWS } from './catalog-rows.js';

export async function seedShipTypes() {
  console.log('Seeding ship types...');
  for (const row of SHIP_TYPE_CATALOG_ROWS) {
    await db.insert(shipTypes).values(row).onConflictDoUpdate({
      target: shipTypes.id,
      set: row,
    });
  }
}
