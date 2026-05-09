import { seedResources } from './seed/resources.js';
import { seedResearchCatalog } from './seed/research.js';
import { seedBuildingTypes } from './seed/building-types.js';
import { seedShipTypes } from './seed/ship-types.js';

async function main() {
  try {
    await seedResources();
    await seedResearchCatalog();
    await seedBuildingTypes();
    await seedShipTypes();
    console.log('Seeding completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
}

main();
