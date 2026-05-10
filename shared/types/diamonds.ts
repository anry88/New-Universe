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
  // Progressive curve tuned to stay affordable in early game:
  // 1m -> 1, 10m -> ~7, 100m -> ~50 (with diamondsPerMinute = 1).
  let cost = Math.round(Math.pow(minutes, 0.85) * diamondsPerMinute);
  if (maxPerAction != null && maxPerAction > 0 && cost > maxPerAction) {
    cost = maxPerAction;
  }
  return Math.max(1, cost);
}
