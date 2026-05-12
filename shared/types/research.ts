export interface ResearchBranch {
  id: string;
  name: { ru: string; en: string };
  description: string | null;
}

export interface ResearchProgress {
  userId: string;
  branch: string;
  level: number;
  completesAt: string | null;
  startedAt?: string | null;
}

export interface StartResearchRequest {
  branch: string;
}

export interface RushResearchRequest {
  branch: string;
}

export interface RushResearchResponse {
  success: boolean;
  cost: number;
  diamondsRemaining: number;
  branch: string;
  level: number;
}

/** Serializable reference for UI copy when an action is blocked by research */
export interface ResearchRequirementRef {
  branch: string;
  level: number;
}

/** Short English labels for tech-tree branches (keep aligned with `backend/src/config/research-catalog.ts`). */
export const RESEARCH_BRANCH_LABELS_EN: Record<string, string> = {
  mining: 'Resource Mining',
  engineering: 'Engineering',
  engines: 'Engines',
  weapons: 'Weapons',
  sensors: 'Sensors',
  logistics: 'Logistics',
  jump_drive: 'Jump Drive',
};

export interface ResearchDefinition {
  branch: string;
  level: number;
  name: { ru: string; en: string };
  description: { ru: string; en: string };
  cost: Partial<Record<ResourceId, number>>;
  timeSec: number;
  requirements: {
    buildings?: { typeId: string; level: number }[];
    research?: { branch: string; level: number }[];
  };
}

export type ResourceId =
  | 'energy'
  | 'water'
  | 'iron'
  | 'carbon'
  | 'silicon'
  | 'methane'
  | 'fuel'
  | 'copper'
  | 'aluminum'
  | 'titanium'
  | 'ice'
  | 'oil'
  | 'sulfur'
  | 'steel'
  | 'electronics'
  | 'mercury'
  | 'magnesium'
  | 'lead'
  | 'uranium'
  | 'cobalt'
  | 'silicon_carbide'
  | 'tritium'
  | 'antimatter'
  | 'dark_matter'
  | 'iridium'
  | 'biomass';
