import type { ResearchDefinition } from '@shared/types/research';
import {
  RESEARCH_CATALOG,
  RESEARCH_TECH_TREE,
  type ResearchEffectTarget,
  type ResearchLevelCatalogEntry,
} from '@shared/config/researchCatalog';

export type { ResearchEffectTarget };
export type TechTreeEntry = ResearchLevelCatalogEntry;

export const RESEARCH_MAX_LEVEL = 5;

/** Flattened tiers — identical ordering to `backend/src/features/research/data.ts` TECH_TREE + effects. */
export const TECH_TREE_DATA: TechTreeEntry[] = RESEARCH_TECH_TREE;

export const BRANCHES = RESEARCH_CATALOG.map((b) => ({
  id: b.branch,
  name: b.branchName,
  description: b.branchDescription,
}));

/** Strip effects for callers that only need `ResearchDefinition`. */
export function definitionWithoutEffects(entry: TechTreeEntry): ResearchDefinition {
  const { effects, ...def } = entry;
  void effects;
  return def;
}
