import type { BuildingId } from './catalog.js';
import type { ShipId } from './catalog.js';

export interface ScenarioDefinition {
  id: string;
  label: string;
  /** Starting stockpiles on the home planet */
  initialResources: Record<string, number>;
  /** Natural regen from planetary richness (units per hour), added before buildings */
  passiveRegenPerHour: Record<string, number>;
  /** Baseline storage cap before logistics + storage buildings */
  baseStorageCap: number;
  structurePlan: StructureStep[];
  researchPlan: ResearchStep[];
  shipPlan: ShipStep[];
}

export interface ScenarioFile {
  version: number;
  horizonSec: number;
  scenarios: ScenarioDefinition[];
}

export type StructureStep =
  | { kind: 'build'; buildingId: BuildingId }
  | { kind: 'upgrade'; buildingId: BuildingId };

export interface ResearchStep {
  branch: string;
  /** Completed tier (1–3). Highest tier per branch drives effects, matching live server lookup */
  tier: number;
}

export interface ShipStep {
  shipId: ShipId;
}

export interface MilestoneRecord {
  firstStructureCompleteSec: number | null;
  firstResearchCompleteSec: number | null;
  engineering2CompleteSec: number | null;
  shipyardReadySec: number | null;
  colonizerOrderedSec: number | null;
  colonizerCompleteSec: number | null;
  foundingPayloadAffordableSec: number | null;
}

export interface BottleneckScore {
  resourceId: string;
  /** Rough shortage proxy: accumulated seconds where this resource was the dominant deficit */
  stallScore: number;
}

export interface ScenarioSummary {
  scenarioId: string;
  label: string;
  horizonSec: number;
  catalogNote: string;
  milestones: MilestoneRecord;
  endingResources: Record<string, number>;
  endingBuildings: Record<string, number>;
  endingResearch: Record<string, number>;
  bottlenecks: BottleneckScore[];
  stallLogTop: Array<{ resourceId: string; secondsStalled: number }>;
}
