import type { ResearchProgress } from '@shared/types/research';

export type ActiveResearchProgress = ResearchProgress & { completesAt: string };

function timestamp(value?: string | null): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function getActiveResearch(rows: ResearchProgress[] | undefined, nowMs = Date.now()): ActiveResearchProgress | null {
  const active = (rows ?? [])
    .map((row) => ({ row, completesAtMs: timestamp(row.completesAt) }))
    .filter((entry): entry is { row: ActiveResearchProgress; completesAtMs: number } => entry.completesAtMs != null && entry.completesAtMs > nowMs && typeof entry.row.completesAt === 'string')
    .sort((a, b) => a.completesAtMs - b.completesAtMs);

  return active[0]?.row ?? null;
}

export function researchStartBlockedByActive(branch: string, rows: ResearchProgress[] | undefined, nowMs = Date.now()): ActiveResearchProgress | null {
  const active = getActiveResearch(rows, nowMs);
  if (!active || active.branch === branch) return null;
  return active;
}
