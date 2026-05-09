import { eq } from 'drizzle-orm';
import { researchProgress } from '../../db/schema.js';
import type { ResearchUnlockRequirement } from '../../config/research-unlocks.js';

export type ResearchLevelsMap = ReadonlyMap<string, number>;

export function levelsMapFromRows(
  rows: Pick<{ branch: string; level: number }, 'branch' | 'level'>[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    if (!row.branch) continue;
    map.set(row.branch, row.level);
  }
  return map;
}

export function meetsResearchRequirement(map: ResearchLevelsMap, req: ResearchUnlockRequirement): boolean {
  const have = map.get(req.branch) ?? 0;
  return have >= req.level;
}

export function describeResearchRequirement(req: ResearchUnlockRequirement): string {
  return `${req.branch} research level ${req.level} required`;
}

export function assertResearchRequirement(
  map: ResearchLevelsMap,
  req: ResearchUnlockRequirement | undefined,
  actionDescription: string,
): void {
  if (!req) return;
  if (meetsResearchRequirement(map, req)) return;
  throw new Error(`${actionDescription}: ${describeResearchRequirement(req)}`);
}

export async function loadUserResearchLevels(userId: string, database: any): Promise<Map<string, number>> {
  const rows = await database.query.researchProgress.findMany({
    where: eq(researchProgress.userId, userId),
    columns: { branch: true, level: true },
  });
  return levelsMapFromRows(rows);
}
