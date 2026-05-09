import { db } from '../index.js';
import { resources } from '../schema/resources.js';
import { RESOURCE_CATALOG_ROWS } from './catalog-rows.js';

export async function seedResources() {
  console.log('Seeding resources...');
  for (const row of RESOURCE_CATALOG_ROWS) {
    await db.insert(resources).values(row).onConflictDoUpdate({
      target: resources.id,
      set: row,
    });
  }
}
