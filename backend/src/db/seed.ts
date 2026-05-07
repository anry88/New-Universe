import { seedResources } from './seed/resources.js';
import { seedResearchBranches } from './seed/research-branches.js';
import { seedBuildingTypes } from './seed/building-types.js';

async function main() {
  try {
    await seedResources();
    await seedResearchBranches();
    await seedBuildingTypes();
    console.log('Seeding completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
}

main();
