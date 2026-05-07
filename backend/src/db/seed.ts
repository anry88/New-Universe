import { seedResources } from './seed/resources.js';
import { seedResearchBranches } from './seed/research-branches.js';

async function main() {
  try {
    await seedResources();
    await seedResearchBranches();
    console.log('Seeding completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
}

main();
