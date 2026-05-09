export const MARKET_PRICING_VERSION = 'p2-mkt-002-v1';

export const TIER_BASELINE_PRICE: Record<number, number> = {
  1: 12,
  2: 48,
  3: 180,
  4: 720,
};

export const RESOURCE_BASELINE_PRICE: Record<string, number> = {
  water: 10,
  iron: 12,
  carbon: 11,
  silicon: 14,
  methane: 13,
  copper: 44,
  aluminum: 46,
  titanium: 55,
  ice: 42,
  sulfur: 40,
  mercury: 170,
  magnesium: 165,
  lead: 160,
  uranium: 230,
  cobalt: 190,
  silicon_carbide: 210,
  tritium: 280,
  antimatter: 840,
  dark_matter: 920,
  iridium: 780,
  biomass: 620,
};

export const MARKET_SPREAD_BPS_BY_TIER: Record<number, number> = {
  1: 900,
  2: 1200,
  3: 1700,
  4: 2500,
};

export const MARKET_PRICE_LIMITS = {
  minStockRatio: 0.05,
  maxStockRatio: 2.5,
  maxStockPressureDeltaPct: 0.35,
  minSpreadBps: 600,
  maxSpreadBps: 4000,
  minUnitPrice: 1,
} as const;
