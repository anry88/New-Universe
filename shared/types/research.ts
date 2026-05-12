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
  planetId: string;
}

export interface StartResearchResponse {
  success: boolean;
  branch: string;
  level: number;
  completesAt: string;
  startedAt: string;
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

/** Localized labels for tech-tree branches (keep aligned with `shared/config/researchCatalog.ts`). */
export const RESEARCH_BRANCH_LABELS: Record<string, { en: string; ru: string }> = {
  mining: { en: 'Resource Mining', ru: 'Добыча ресурсов' },
  engineering: { en: 'Engineering', ru: 'Инженерия' },
  engines: { en: 'Engines', ru: 'Двигатели' },
  energy: { en: 'Energy', ru: 'Энергетика' },
  sensors: { en: 'Sensors', ru: 'Сенсоры' },
  logistics: { en: 'Logistics', ru: 'Логистика' },
  weapons: { en: 'Weapons', ru: 'Вооружение' },
  jump_drive: { en: 'Jump Drive', ru: 'Прыжковый двигатель' },
};

/** Short English labels for tech-tree branches. */
export const RESEARCH_BRANCH_LABELS_EN: Record<string, string> = Object.fromEntries(
  Object.entries(RESEARCH_BRANCH_LABELS).map(([branch, labels]) => [branch, labels.en]),
);

export function researchBranchLabel(branch: string, locale: 'en' | 'ru'): string {
  return RESEARCH_BRANCH_LABELS[branch]?.[locale] ?? branch;
}

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
