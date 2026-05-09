import { describe, expect, it } from 'vitest';
import {
  calculateNpcMarketQuote,
  hasArbitrageLoop,
  resolveBaselinePrice,
} from './pricing.js';

describe('npc market pricing model', () => {
  it('returns deterministic baseline price for each resource', () => {
    expect(resolveBaselinePrice('iron', 1)).toBe(12);
    expect(resolveBaselinePrice('tritium', 3)).toBe(280);
    expect(resolveBaselinePrice('unknown_future_resource', 2)).toBe(48);
  });

  it('applies tier weighting and stock pressure for edge resources', () => {
    const lowTier = calculateNpcMarketQuote({ resourceId: 'water', tier: 1, stockRatio: 1 });
    const highTier = calculateNpcMarketQuote({ resourceId: 'dark_matter', tier: 4, stockRatio: 1 });
    expect(highTier.midPrice).toBeGreaterThan(lowTier.midPrice);

    const lowStock = calculateNpcMarketQuote({ resourceId: 'iron', tier: 1, stockRatio: 0.1 });
    const highStock = calculateNpcMarketQuote({ resourceId: 'iron', tier: 1, stockRatio: 2.0 });
    expect(lowStock.midPrice).toBeGreaterThan(highStock.midPrice);
  });

  it('prevents instant buy/sell arbitrage loop', () => {
    const quote = calculateNpcMarketQuote({ resourceId: 'silicon', tier: 1, stockRatio: 1 });
    expect(quote.buyPrice).toBeGreaterThan(quote.sellPrice);
    expect(hasArbitrageLoop(quote)).toBe(false);
  });

  it('recalculates independently and does not mutate previous quote snapshots', () => {
    const first = calculateNpcMarketQuote({ resourceId: 'copper', tier: 2, stockRatio: 0.5 });
    const second = calculateNpcMarketQuote({ resourceId: 'copper', tier: 2, stockRatio: 2.0 });
    expect(first.midPrice).not.toBe(second.midPrice);
    expect(first.resourceId).toBe('copper');
    expect(second.resourceId).toBe('copper');
    expect(first.modelVersion).toBe(second.modelVersion);
  });
});
