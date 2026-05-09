import {
  MARKET_PRICE_LIMITS,
  MARKET_PRICING_VERSION,
  MARKET_SPREAD_BPS_BY_TIER,
  RESOURCE_BASELINE_PRICE,
  TIER_BASELINE_PRICE,
} from '../../config/market-prices.js';

export interface MarketPricingInput {
  resourceId: string;
  tier: number;
  stockRatio: number;
}

export interface MarketPriceQuote {
  resourceId: string;
  tier: number;
  baselinePrice: number;
  midPrice: number;
  buyPrice: number;
  sellPrice: number;
  spreadBps: number;
  stockPressure: number;
  modelVersion: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundPrice(value: number): number {
  return Math.round(value * 100) / 100;
}

export function resolveBaselinePrice(resourceId: string, tier: number): number {
  const resourceBaseline = RESOURCE_BASELINE_PRICE[resourceId];
  if (resourceBaseline) return resourceBaseline;
  const tierBaseline = TIER_BASELINE_PRICE[tier];
  if (tierBaseline) return tierBaseline;
  return TIER_BASELINE_PRICE[1];
}

export function calculateNpcMarketQuote(input: MarketPricingInput): MarketPriceQuote {
  const tier = Number.isFinite(input.tier) && input.tier > 0 ? Math.floor(input.tier) : 1;
  const baselinePrice = Math.max(
    MARKET_PRICE_LIMITS.minUnitPrice,
    resolveBaselinePrice(input.resourceId, tier),
  );

  const stockRatio = clamp(
    input.stockRatio,
    MARKET_PRICE_LIMITS.minStockRatio,
    MARKET_PRICE_LIMITS.maxStockRatio,
  );

  // 1.0 stock ratio is neutral; low stock makes price higher.
  const rawPressure = (1 - stockRatio) * 0.25;
  const stockPressure = clamp(
    rawPressure,
    -MARKET_PRICE_LIMITS.maxStockPressureDeltaPct,
    MARKET_PRICE_LIMITS.maxStockPressureDeltaPct,
  );

  const midPrice = Math.max(
    MARKET_PRICE_LIMITS.minUnitPrice,
    baselinePrice * (1 + stockPressure),
  );

  const spreadBase = MARKET_SPREAD_BPS_BY_TIER[tier] ?? MARKET_SPREAD_BPS_BY_TIER[4];
  const lowStockSpreadBonus = stockRatio < 0.4 ? Math.round((0.4 - stockRatio) * 2000) : 0;
  const spreadBps = clamp(
    spreadBase + lowStockSpreadBonus,
    MARKET_PRICE_LIMITS.minSpreadBps,
    MARKET_PRICE_LIMITS.maxSpreadBps,
  );
  const spread = spreadBps / 10_000;

  // Anti-abuse: ensure a deterministic spread window around mid-price.
  const buyPrice = Math.max(
    MARKET_PRICE_LIMITS.minUnitPrice,
    midPrice * (1 + spread / 2),
  );
  const sellPrice = Math.max(
    MARKET_PRICE_LIMITS.minUnitPrice,
    midPrice * (1 - spread / 2),
  );

  return {
    resourceId: input.resourceId,
    tier,
    baselinePrice: roundPrice(baselinePrice),
    midPrice: roundPrice(midPrice),
    buyPrice: roundPrice(buyPrice),
    sellPrice: roundPrice(sellPrice),
    spreadBps,
    stockPressure,
    modelVersion: MARKET_PRICING_VERSION,
  };
}

export function hasArbitrageLoop(quote: Pick<MarketPriceQuote, 'buyPrice' | 'sellPrice'>): boolean {
  return quote.sellPrice >= quote.buyPrice;
}
