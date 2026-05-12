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

import * as researchCatalogModule from '@shared/config/researchCatalog.js';
import type { ResearchBranchCatalog, ResearchLevelCatalogEntry } from '@shared/config/researchCatalog.js';

type ResearchCatalogRuntime = {
  RESEARCH_CATALOG: ResearchBranchCatalog[];
  RESEARCH_TECH_TREE: ResearchLevelCatalogEntry[];
};

const researchCatalogRuntime = (
  'RESEARCH_CATALOG' in researchCatalogModule
    ? researchCatalogModule
    : (researchCatalogModule as unknown as { default: ResearchCatalogRuntime }).default
) as ResearchCatalogRuntime;

export const RESEARCH_CATALOG = researchCatalogRuntime.RESEARCH_CATALOG;
export const RESEARCH_TECH_TREE = researchCatalogRuntime.RESEARCH_TECH_TREE;
