import { db } from '../index.js';
import { researchBranches } from '../schema/research.js';
import { RESEARCH_CATALOG } from '../../config/research-catalog.js';

export async function seedResearchCatalog() {
  console.log('Seeding research catalog branches...');

  for (const branch of RESEARCH_CATALOG) {
    const row = {
      id: branch.branch,
      name: branch.branchName,
      description: `${branch.branchDescription.en} / ${branch.branchDescription.ru}`,
    };

    await db.insert(researchBranches).values(row).onConflictDoUpdate({
      target: researchBranches.id,
      set: row,
    });
  }
}
