import { RESEARCH_CATALOG } from '../../config/research-catalog.js';
import { db } from '../index.js';
import { researchBranches } from '../schema/research.js';

export async function seedResearchBranches() {
  console.log('Seeding research branches...');
  for (const branch of RESEARCH_CATALOG) {
    const row = {
      id: branch.branch,
      name: branch.branchName,
    };
    await db.insert(researchBranches).values(row).onConflictDoUpdate({
      target: researchBranches.id,
      set: row,
    });
  }
}
