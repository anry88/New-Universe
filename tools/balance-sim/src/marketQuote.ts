import {
  MARKET_SPREAD_BPS_BY_TIER,
  RESOURCE_BASELINE_PRICE,
  RESOURCE_TIER,
  TIER_BASELINE_PRICE,
} from './catalog.js';

const LIMITS = {
  minStockRatio: 0.05,
  maxStockRatio: 2.5,
  maxStockPressureDeltaPct: 0.35,
  minSpreadBps: 600,
  maxSpreadBps: 4000,
  minUnitPrice: 1,
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function resolveBaselinePrice(resourceId: string): number {
  const resourceBaseline = RESOURCE_BASELINE_PRICE[resourceId];
  if (resourceBaseline !== undefined) return resourceBaseline;
  const tier = RESOURCE_TIER[resourceId] ?? 1;
  return TIER_BASELINE_PRICE[tier] ?? TIER_BASELINE_PRICE[1]!;
}

/** Neutral NPC quote (stockRatio=1) — buyPrice is what the player pays in iron per unit when purchasing a resource. */
export function npcBuyPriceIronPerUnit(resourceId: string, stockRatio = 1): number {
  const tier = RESOURCE_TIER[resourceId] ?? 1;
  const baselinePrice = Math.max(LIMITS.minUnitPrice, resolveBaselinePrice(resourceId));
  const stock = clamp(stockRatio, LIMITS.minStockRatio, LIMITS.maxStockRatio);
  const rawPressure = (1 - stock) * 0.25;
  const stockPressure = clamp(
    rawPressure,
    -LIMITS.maxStockPressureDeltaPct,
    LIMITS.maxStockPressureDeltaPct,
  );
  const midPrice = Math.max(LIMITS.minUnitPrice, baselinePrice * (1 + stockPressure));
  const spreadBase = MARKET_SPREAD_BPS_BY_TIER[tier] ?? MARKET_SPREAD_BPS_BY_TIER[4]!;
  const lowStockSpreadBonus = stock < 0.4 ? Math.round((0.4 - stock) * 2000) : 0;
  const spreadBps = clamp(
    spreadBase + lowStockSpreadBonus,
    LIMITS.minSpreadBps,
    LIMITS.maxSpreadBps,
  );
  const spread = spreadBps / 10_000;
  const buyPrice = Math.max(LIMITS.minUnitPrice, midPrice * (1 + spread / 2));
  return Math.round(buyPrice * 100) / 100;
}

/** Credits iron when selling one unit at neutral stock. */
export function npcSellPriceIronPerUnit(resourceId: string, stockRatio = 1): number {
  const tier = RESOURCE_TIER[resourceId] ?? 1;
  const baselinePrice = Math.max(LIMITS.minUnitPrice, resolveBaselinePrice(resourceId));
  const stock = clamp(stockRatio, LIMITS.minStockRatio, LIMITS.maxStockRatio);
  const rawPressure = (1 - stock) * 0.25;
  const stockPressure = clamp(
    rawPressure,
    -LIMITS.maxStockPressureDeltaPct,
    LIMITS.maxStockPressureDeltaPct,
  );
  const midPrice = Math.max(LIMITS.minUnitPrice, baselinePrice * (1 + stockPressure));
  const spreadBase = MARKET_SPREAD_BPS_BY_TIER[tier] ?? MARKET_SPREAD_BPS_BY_TIER[4]!;
  const lowStockSpreadBonus = stock < 0.4 ? Math.round((0.4 - stock) * 2000) : 0;
  const spreadBps = clamp(
    spreadBase + lowStockSpreadBonus,
    LIMITS.minSpreadBps,
    LIMITS.maxSpreadBps,
  );
  const spread = spreadBps / 10_000;
  const sellPrice = Math.max(LIMITS.minUnitPrice, midPrice * (1 - spread / 2));
  return Math.round(sellPrice * 100) / 100;
}
