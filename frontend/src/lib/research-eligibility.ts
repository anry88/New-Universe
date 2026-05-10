import type { ResearchDefinition, ResearchProgress, ResearchRequirementRef } from '@shared/types/research';

export interface ResearchEligibility {
  ok: boolean;
  labMessage?: string;
  missingResearch: ResearchRequirementRef[];
  /** Plain-language shortage when `planetResources` is provided */
  resourceMessage?: string;
}

function resourceAvailabilityMessage(
  cost: ResearchDefinition['cost'],
  planetResources: { resourceId: string; amount: string | number }[] | undefined,
): string | undefined {
  if (!planetResources?.length) return undefined;
  const have = new Map<string, number>();
  for (const pr of planetResources) {
    have.set(pr.resourceId, Number(pr.amount));
  }
  const lines: string[] = [];
  for (const [rid, need] of Object.entries(cost)) {
    const stock = have.get(rid) ?? 0;
    if (stock < need) {
      lines.push(`${rid}: need ${need}, have ${Math.floor(stock)}`);
    }
  }
  return lines.length ? lines.join(' · ') : undefined;
}

/**
 * Client-side mirror of `/research/start` gate checks (lab + prerequisite tiers + optional stock preview).
 */
export function evaluateResearchEligibility(
  def: ResearchDefinition,
  labLevel: number,
  researchRows: ResearchProgress[] | undefined,
  planetResources?: { resourceId: string; amount: string | number }[] | undefined,
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

  const resourceMessage = resourceAvailabilityMessage(def.cost, planetResources);

  const ok = !labMessage && missingResearch.length === 0 && !resourceMessage;
  return { ok, labMessage, missingResearch, resourceMessage };
}
