import type { ResearchDefinition, ResearchProgress, ResearchRequirementRef } from '@shared/types/research';

export interface ResearchEligibility {
  ok: boolean;
  labMessage?: string;
  missingResearch: ResearchRequirementRef[];
}

/**
 * Client-side mirror of `/research/start` gate checks (lab + prerequisite tiers).
 */
export function evaluateResearchEligibility(
  def: ResearchDefinition,
  labLevel: number,
  researchRows: ResearchProgress[] | undefined,
): ResearchEligibility {
  const rows = researchRows ?? [];
  const missingResearch: ResearchRequirementRef[] = [];

  const labReq = def.requirements.buildings?.find((b) => b.typeId === 'lab');
  let labMessage: string | undefined;
  if (labReq && labLevel < labReq.level) {
    labMessage = `Laboratory level ${labReq.level} required (current L${labLevel})`;
  }

  for (const req of def.requirements.research ?? []) {
    const row = rows.find((r) => r.branch === req.branch);
    const doneLevel = row?.level ?? 0;
    if (doneLevel < req.level) {
      missingResearch.push({ branch: req.branch, level: req.level });
    }
  }

  const ok = !labMessage && missingResearch.length === 0;
  return { ok, labMessage, missingResearch };
}
