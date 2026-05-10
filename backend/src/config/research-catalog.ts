/**
 * Server-side re-export of the canonical catalog authored in `shared/config/researchCatalog.ts`
 * so backend seeds, effects, and Vitest stay aligned with the React tech tree without duplication.
 *
 * Use the `@shared/...` path (not `../../..` relative segments): in Docker, `shared/` is mounted at
 * `/app/shared` next to `src/`, so `../../../shared` incorrectly resolves outside the backend root.
 */
export type {
  ResearchEffectTarget,
  ResearchLevelCatalogEntry,
  ResearchBranchCatalog,
} from '@shared/config/researchCatalog.js';

export { RESEARCH_CATALOG, RESEARCH_TECH_TREE } from '@shared/config/researchCatalog.js';
