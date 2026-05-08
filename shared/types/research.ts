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
  cost: Record<string, number>;
  timeSec: number;
  requirements: {
    buildings?: { typeId: string; level: number }[];
    research?: { branch: string; level: number }[];
  };
}
