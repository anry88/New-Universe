import { db as defaultDb } from '../../db/index.js';
import { researchProgress } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import type { ResearchProgress } from '@shared/types/research.js';
import type { ResearchEffectTarget, ResearchLevelCatalogEntry } from '@shared/config/researchCatalog.js';
import { RESEARCH_TECH_TREE } from '../../config/research-catalog.js';

export interface ResearchEffectModifier {
  source: string;
  target: ResearchEffectTarget;
  multiplier: number;
}

export interface ResearchEffects {
  resourceProductionMultiplier: number;
  resourceStorageMultiplier: number;
  energyGenerationMultiplier: number;
  energyStorageMultiplier: number;
  energyEfficiencyMultiplier: number;
  shipSpeedMultiplier: number;
  sensorRangeMultiplier: number;
  weaponRangeMultiplier: number;
  buildTimeMultiplier: number;
}

export interface ResearchEffectsRequestCache {
  effectsByUserId: Map<string, Promise<ResearchEffects>>;
}

const DEFAULT_EFFECTS: ResearchEffects = {
  resourceProductionMultiplier: 1,
  resourceStorageMultiplier: 1,
  energyGenerationMultiplier: 1,
  energyStorageMultiplier: 1,
  energyEfficiencyMultiplier: 1,
  shipSpeedMultiplier: 1,
  sensorRangeMultiplier: 1,
  weaponRangeMultiplier: 1,
  buildTimeMultiplier: 1,
};

type TierEffects = ResearchLevelCatalogEntry['effects'];
type TierEffectRow = TierEffects[number];

const TECH_EFFECTS_LOOKUP = new Map<string, TierEffects>(
  RESEARCH_TECH_TREE.map((entry: ResearchLevelCatalogEntry) => [`${entry.branch}:${entry.level}`, entry.effects]),
);

function clampMultiplier(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  return value;
}

export function buildResearchEffectModifiers(
  progressRows: Pick<ResearchProgress, 'branch' | 'level'>[],
): ResearchEffectModifier[] {
  const modifiers: ResearchEffectModifier[] = [];

  for (const progress of progressRows) {
    if (!progress?.branch || !progress.level || progress.level <= 0) continue;
    const effects = TECH_EFFECTS_LOOKUP.get(`${progress.branch}:${progress.level}`);
    if (!effects) continue;
    modifiers.push(
      ...effects.map((effect: TierEffectRow) => ({
        source: `${progress.branch}@${progress.level}`,
        target: effect.target,
        multiplier: effect.multiplier,
      }))
    );
  }

  // Stable deterministic order regardless of source row order.
  modifiers.sort((left, right) => {
    if (left.target !== right.target) return left.target.localeCompare(right.target);
    if (left.source !== right.source) return left.source.localeCompare(right.source);
    return left.multiplier - right.multiplier;
  });

  return modifiers;
}

export function composeResearchEffects(modifiers: ResearchEffectModifier[]): ResearchEffects {
  return modifiers.reduce<ResearchEffects>((acc, modifier) => {
    const m = clampMultiplier(modifier.multiplier);
    switch (modifier.target) {
      case 'resourceProduction':
        acc.resourceProductionMultiplier *= m;
        break;
      case 'resourceStorage':
        acc.resourceStorageMultiplier *= m;
        break;
      case 'energyGeneration':
        acc.energyGenerationMultiplier *= m;
        break;
      case 'energyStorage':
        acc.energyStorageMultiplier *= m;
        break;
      case 'energyEfficiency':
        acc.energyEfficiencyMultiplier *= m;
        break;
      case 'shipSpeed':
        acc.shipSpeedMultiplier *= m;
        break;
      case 'sensorRange':
        acc.sensorRangeMultiplier *= m;
        break;
      case 'weaponRange':
        acc.weaponRangeMultiplier *= m;
        break;
      case 'buildTime':
        acc.buildTimeMultiplier *= m;
        break;
    }
    return acc;
  }, { ...DEFAULT_EFFECTS });
}

export function computeResearchEffects(
  progressRows: Pick<ResearchProgress, 'branch' | 'level'>[],
): ResearchEffects {
  return composeResearchEffects(buildResearchEffectModifiers(progressRows));
}

export function createResearchEffectsRequestCache(): ResearchEffectsRequestCache {
  return { effectsByUserId: new Map() };
}

async function loadResearchEffectsForUser(userId: string, database: any = defaultDb): Promise<ResearchEffects> {
  const progressRows = await database.query.researchProgress.findMany({
    where: eq(researchProgress.userId, userId),
    columns: { branch: true, level: true },
  });
  return computeResearchEffects(progressRows);
}

export async function getResearchEffectsForUser(
  userId: string,
  database: any = defaultDb,
  cache?: ResearchEffectsRequestCache,
): Promise<ResearchEffects> {
  if (!cache) {
    return loadResearchEffectsForUser(userId, database);
  }

  let cached = cache.effectsByUserId.get(userId);
  if (!cached) {
    cached = loadResearchEffectsForUser(userId, database);
    cache.effectsByUserId.set(userId, cached);
  }
  return cached;
}

/**
 * Clears a request-scoped research-effects snapshot after tier completions/rushes.
 * Omit `cache` for callers that do not share snapshots inside the current request.
 */
export function invalidateResearchEffectsCache(userId: string, cache?: ResearchEffectsRequestCache): void {
  cache?.effectsByUserId.delete(userId);
}

export function applyProductionRate(baseRegenRate: number, effects: ResearchEffects): number {
  return baseRegenRate * effects.resourceProductionMultiplier;
}

export function applyStorageCap(baseStorageCap: number, effects: ResearchEffects): number {
  return baseStorageCap * effects.resourceStorageMultiplier;
}

export function applyEnergyGeneration(baseEnergyPerHour: number, effects: ResearchEffects): number {
  return baseEnergyPerHour * effects.energyGenerationMultiplier;
}

export function applyEnergyStorage(baseEnergyCap: number, effects: ResearchEffects): number {
  return baseEnergyCap * effects.energyStorageMultiplier;
}

export function applyEnergyRequirement(baseEnergyRequired: number, effects: ResearchEffects): number {
  return baseEnergyRequired * effects.energyEfficiencyMultiplier;
}

export function applyShipSpeed(baseSpeed: number, effects: ResearchEffects): number {
  return baseSpeed * effects.shipSpeedMultiplier;
}

export function applySensorRange(baseSensorRange: number, effects: ResearchEffects): number {
  return baseSensorRange * effects.sensorRangeMultiplier;
}

export function applyWeaponRange(baseWeaponRange: number, effects: ResearchEffects): number {
  return baseWeaponRange * effects.weaponRangeMultiplier;
}

export function applyBuildTimeSeconds(baseSeconds: number, effects: ResearchEffects): number {
  return Math.max(1, Math.ceil(baseSeconds * effects.buildTimeMultiplier));
}
