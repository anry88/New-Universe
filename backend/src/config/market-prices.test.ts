import { describe, expect, it } from 'vitest';
import {
  MARKET_PRICING_VERSION,
  MARKET_SPREAD_BPS_BY_TIER,
  RESOURCE_BASELINE_PRICE,
} from './market-prices.js';
import { calculateNpcMarketQuote, hasArbitrageLoop } from '../features/market/pricing.js';

/**
 * Must stay aligned with `backend/src/db/seed/resources.ts` tiers for resources that appear in
 * `RESOURCE_BASELINE_PRICE` (NPC broker trades iron-denominated values against these ids).
 */
const RESOURCE_TIER_BY_ID: Record<string, number> = {
  water: 1,
  iron: 1,
  carbon: 1,
  silicon: 1,
  methane: 1,
  copper: 2,
  aluminum: 2,
  titanium: 2,
  ice: 2,
  sulfur: 2,
  steel: 2,
  electronics: 2,
  mercury: 3,
  magnesium: 3,
  lead: 3,
  uranium: 3,
  cobalt: 3,
  silicon_carbide: 3,
  tritium: 3,
  antimatter: 4,
  dark_matter: 4,
  iridium: 4,
  biomass: 4,
};

describe('market-prices catalog vs seed tiers', () => {
  it('keeps RESOURCE_BASELINE_PRICE keys in sync with tier map', () => {
    expect(Object.keys(RESOURCE_BASELINE_PRICE).sort()).toEqual(Object.keys(RESOURCE_TIER_BY_ID).sort());
  });
});

/** Epic P2-EPIC-MARKET-NPC: utility broker cycle (sell surplus for iron, buy needed goods) rests on stable spreads. */
describe('P2-EPIC-MARKET-NPC pricing gate', () => {
  it('pins quotes to MARKET_PRICING_VERSION', () => {
    const quote = calculateNpcMarketQuote({ resourceId: 'iron', tier: 1, stockRatio: 1 });
    expect(quote.modelVersion).toBe(MARKET_PRICING_VERSION);
  });

  it('defines positive spreads for tiers 1–4', () => {
    for (const tier of [1, 2, 3, 4] as const) {
      expect(MARKET_SPREAD_BPS_BY_TIER[tier]).toBeGreaterThan(0);
    }
  });

  it('has no instant buy↔sell arbitrage at neutral stock for every listed resource', () => {
    for (const resourceId of Object.keys(RESOURCE_BASELINE_PRICE)) {
      const tier = RESOURCE_TIER_BY_ID[resourceId];
      const quote = calculateNpcMarketQuote({ resourceId, tier, stockRatio: 1 });
      expect(quote.buyPrice).toBeGreaterThan(quote.sellPrice);
      expect(hasArbitrageLoop(quote)).toBe(false);
    }
  });
});
