import type { ResearchBranchCatalog } from '@shared/config/researchCatalog.js';
import { RESOURCE_BASELINE_PRICE } from '../../config/market-prices.js';
import { RESEARCH_CATALOG } from '../../config/research-catalog.js';
import {
  BUILDING_TYPE_CATALOG_ROWS,
  RESOURCE_CATALOG_ROWS,
  SHIP_TYPE_CATALOG_ROWS,
} from './catalog-rows.js';

export interface CatalogAuditResult {
  ok: boolean;
  errors: string[];
}

function isNonEmptyLocalizedName(name: { ru?: string; en?: string }, ctx: string, errors: string[]): void {
  const ru = name.ru?.trim() ?? '';
  const en = name.en?.trim() ?? '';
  if (!ru) errors.push(`${ctx}: missing or empty name.ru`);
  if (!en) errors.push(`${ctx}: missing or empty name.en`);
}

function assertNoDuplicateIds(ids: string[], label: string, errors: string[]): void {
  const seen = new Map<string, number>();
  for (const id of ids) {
    seen.set(id, (seen.get(id) ?? 0) + 1);
  }
  for (const [id, count] of seen.entries()) {
    if (count > 1) errors.push(`${label}: duplicate id "${id}" (${count} times)`);
  }
}

/** Allowed defaultStorageCap values per tier (matches seeded catalog conventions). */
const ALLOWED_CAPS_BY_TIER: Record<number, Set<number>> = {
  1: new Set([5000, 1000]),
  2: new Set([2500]),
  3: new Set([1000, 500]),
  4: new Set([100, 1000]),
};

function collectCostResourceIds(buildings: typeof BUILDING_TYPE_CATALOG_ROWS): Set<string> {
  const ids = new Set<string>();
  for (const b of buildings) {
    const cost = b.baseCost as Record<string, number>;
    for (const k of Object.keys(cost)) ids.add(k);
    const out = b.baseOutput as Record<string, unknown>;
    const rid = out.resourceId;
    if (typeof rid === 'string') ids.add(rid);
    const conv = out.conversion as { from?: string; to?: string } | undefined;
    if (conv?.from) ids.add(conv.from);
    if (conv?.to) ids.add(conv.to);
  }
  return ids;
}

function collectShipCostIds(ships: typeof SHIP_TYPE_CATALOG_ROWS): Set<string> {
  const ids = new Set<string>();
  for (const s of ships) {
    const cost = s.buildCost as Record<string, number>;
    for (const k of Object.keys(cost)) ids.add(k);
  }
  return ids;
}

function collectResearchCostIds(): Set<string> {
  const ids = new Set<string>();
  for (const branch of RESEARCH_CATALOG) {
    for (const lvl of branch.levels) {
      for (const k of Object.keys(lvl.cost)) ids.add(k);
    }
  }
  return ids;
}

/**
 * Validates seeded catalog rows and cross-references (no DB).
 * Intended for CI and local drift detection before releases.
 */
export function runCatalogAudit(): CatalogAuditResult {
  const errors: string[] = [];

  const resourceIds = RESOURCE_CATALOG_ROWS.map((r) => r.id);
  assertNoDuplicateIds(resourceIds, 'resources', errors);

  const resourceSet = new Set(resourceIds);

  for (const row of RESOURCE_CATALOG_ROWS) {
    isNonEmptyLocalizedName(row.name, `resource "${row.id}"`, errors);
    const tier = row.tier;
    if (!Number.isInteger(tier) || tier < 1 || tier > 4) {
      errors.push(`resource "${row.id}": tier must be integer 1–4, got ${tier}`);
    } else {
      const allowed = ALLOWED_CAPS_BY_TIER[tier];
      if (!allowed?.has(row.defaultStorageCap)) {
        errors.push(
          `resource "${row.id}": tier ${tier} defaultStorageCap ${row.defaultStorageCap} not in allowed set for tier`,
        );
      }
    }
  }

  const buildingIds = BUILDING_TYPE_CATALOG_ROWS.map((b) => b.id);
  assertNoDuplicateIds(buildingIds, 'building_types', errors);
  const buildingSet = new Set(buildingIds);

  for (const row of BUILDING_TYPE_CATALOG_ROWS) {
    isNonEmptyLocalizedName(row.name, `building "${row.id}"`, errors);
    for (const dep of row.deps ?? []) {
      if (!buildingSet.has(dep.typeId)) {
        errors.push(`building "${row.id}": dependency references unknown building type "${dep.typeId}"`);
      }
    }
  }

  const shipIds = SHIP_TYPE_CATALOG_ROWS.map((s) => s.id);
  assertNoDuplicateIds(shipIds, 'ship_types', errors);

  for (const row of SHIP_TYPE_CATALOG_ROWS) {
    isNonEmptyLocalizedName(row.name, `ship "${row.id}"`, errors);
    for (const req of row.requiredBuildings ?? []) {
      if (!buildingSet.has(req.typeId)) {
        errors.push(`ship "${row.id}": requiredBuildings references unknown building "${req.typeId}"`);
      }
    }
  }

  const researchBranchIds = RESEARCH_CATALOG.map((b: ResearchBranchCatalog) => b.branch);
  assertNoDuplicateIds(researchBranchIds, 'research_branches', errors);

  for (const branch of RESEARCH_CATALOG) {
    isNonEmptyLocalizedName(branch.branchName, `research branch "${branch.branch}"`, errors);
  }

  for (const key of Object.keys(RESOURCE_BASELINE_PRICE)) {
    if (!resourceSet.has(key)) {
      errors.push(`market RESOURCE_BASELINE_PRICE key "${key}" has no matching seeded resource id`);
    }
  }

  for (const rid of collectCostResourceIds(BUILDING_TYPE_CATALOG_ROWS)) {
    if (!resourceSet.has(rid)) {
      errors.push(`building costs/output reference unknown resource "${rid}"`);
    }
  }

  for (const rid of collectShipCostIds(SHIP_TYPE_CATALOG_ROWS)) {
    if (!resourceSet.has(rid)) {
      errors.push(`ship buildCost references unknown resource "${rid}"`);
    }
  }

  for (const rid of collectResearchCostIds()) {
    if (!resourceSet.has(rid)) {
      errors.push(`research catalog cost references unknown resource "${rid}"`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}
