/**
 * Client/server-shared rush pricing formula (must stay aligned with `backend/src/lib/diamonds.ts`).
 */
export function estimateRushDiamondCost(
  remainingSec: number,
  diamondsPerMinute: number,
  maxPerAction: number | null,
): number {
  if (remainingSec <= 0) return 0;
  const minutes = Math.ceil(remainingSec / 60);
  let cost = minutes * diamondsPerMinute;
  if (maxPerAction != null && maxPerAction > 0 && cost > maxPerAction) {
    cost = maxPerAction;
  }
  return Math.max(1, cost);
}
