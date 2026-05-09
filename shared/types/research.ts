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
}

export interface StartResearchRequest {
  branch: string;
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
  | 'water'
  | 'iron'
  | 'carbon'
  | 'silicon'
  | 'methane'
  | 'copper'
  | 'aluminum'
  | 'titanium'
  | 'ice'
  | 'sulfur'
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
