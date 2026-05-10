/**
 * Server-side re-export of the canonical catalog authored in `shared/config/researchCatalog.ts`
 * so backend seeds, effects, and Vitest stay aligned with the React tech tree without duplication.
 */
export type {
  ResearchEffectTarget,
  ResearchLevelCatalogEntry,
  ResearchBranchCatalog,
} from '../../../shared/config/researchCatalog.js';

export { RESEARCH_CATALOG, RESEARCH_TECH_TREE } from '../../../shared/config/researchCatalog.js';
