import { seedResources } from './seed/resources.js';

async function main() {
  try {
    await seedResources();
    console.log('Seeding completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
}

main();
