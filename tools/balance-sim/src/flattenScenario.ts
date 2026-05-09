import type { MarketChunk, MarketStep, ScenarioDefinition } from './types.js';

function flattenChunks(chunks: MarketChunk[] | undefined): MarketStep[] {
  if (!chunks?.length) return [];
  const out: MarketStep[] = [];
  for (const c of chunks) {
    if (c.op === 'repeatBuy') {
      for (let i = 0; i < c.repeat; i++) {
        out.push({ kind: 'buy', resourceId: c.resourceId, amount: c.chunkAmount });
      }
    } else {
      for (let i = 0; i < c.repeat; i++) {
        out.push({ kind: 'sell', resourceId: c.resourceId, amount: c.chunkAmount });
      }
    }
  }
  return out;
}

/** Merge explicit marketPlan rows after chunked trades (sell liquidity before buys). */
export function flattenScenario(s: ScenarioDefinition): ScenarioDefinition {
  const fromChunks = flattenChunks(s.marketChunks);
  const merged = [...fromChunks, ...(s.marketPlan ?? [])];
  return {
    ...s,
    marketPlan: merged.length ? merged : undefined,
    marketChunks: undefined,
  };
}
