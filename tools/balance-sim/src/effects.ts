import { RESEARCH_TIERS } from './catalog.js';

export interface ResearchEffects {
  resourceProductionMultiplier: number;
  resourceStorageMultiplier: number;
  shipSpeedMultiplier: number;
  sensorRangeMultiplier: number;
  buildTimeMultiplier: number;
}

const DEFAULT_EFFECTS: ResearchEffects = {
  resourceProductionMultiplier: 1,
  resourceStorageMultiplier: 1,
  shipSpeedMultiplier: 1,
  sensorRangeMultiplier: 1,
  buildTimeMultiplier: 1,
};

type EffectKey = keyof ResearchEffects;

const TARGET_MAP: Record<string, EffectKey> = {
  resourceProduction: 'resourceProductionMultiplier',
  resourceStorage: 'resourceStorageMultiplier',
  shipSpeed: 'shipSpeedMultiplier',
  sensorRange: 'sensorRangeMultiplier',
  buildTime: 'buildTimeMultiplier',
};

function tierEffects(branch: string, tier: number): Array<{ key: EffectKey; multiplier: number }> {
  const row = RESEARCH_TIERS[branch]?.[tier];
  if (!row) return [];
  const out: Array<{ key: EffectKey; multiplier: number }> = [];
  for (const e of row.effects) {
    const key = TARGET_MAP[e.target];
    if (key) out.push({ key, multiplier: e.multiplier });
  }
  return out;
}

/** Highest completed tier per branch only (matches backend research effects lookup). */
export function composeEffects(completed: Record<string, number>): ResearchEffects {
  const modifiers: Array<{ key: EffectKey; multiplier: number; source: string }> = [];
  for (const [branch, tier] of Object.entries(completed)) {
    if (!tier || tier <= 0) continue;
    for (const eff of tierEffects(branch, tier)) {
      modifiers.push({ ...eff, source: `${branch}@${tier}` });
    }
  }
  modifiers.sort((a, b) => {
    if (a.key !== b.key) return a.key.localeCompare(b.key);
    if (a.source !== b.source) return a.source.localeCompare(b.source);
    return a.multiplier - b.multiplier;
  });

  return modifiers.reduce<ResearchEffects>((acc, m) => {
    const mult = Number.isFinite(m.multiplier) && m.multiplier > 0 ? m.multiplier : 1;
    acc[m.key] *= mult;
    return acc;
  }, { ...DEFAULT_EFFECTS });
}

export function applyProductionRate(basePerHour: number, fx: ResearchEffects): number {
  return basePerHour * fx.resourceProductionMultiplier;
}

export function applyStorageCap(base: number, fx: ResearchEffects): number {
  return base * fx.resourceStorageMultiplier;
}

export function applyBuildTimeSeconds(baseSeconds: number, fx: ResearchEffects): number {
  return Math.max(1, Math.ceil(baseSeconds * fx.buildTimeMultiplier));
}
