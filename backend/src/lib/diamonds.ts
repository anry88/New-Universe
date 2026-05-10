import { env } from './env.js';
import { estimateRushDiamondCost } from '@shared/types/diamonds.js';

/** Whole seconds remaining until queue completes (0 if already due). */
export function rushRemainingSeconds(completesAt: Date, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((completesAt.getTime() - now.getTime()) / 1000));
}

/**
 * Diamonds to skip remaining queue time. Uses ceil(minutes) × rate, optional max cap.
 * Returns 0 when nothing remains (caller should finalize without charging).
 */
export function rushDiamondCost(remainingSec: number): number {
  const max = env.DIAMOND_RUSH_MAX_PER_ACTION;
  return estimateRushDiamondCost(
    remainingSec,
    env.DIAMOND_RUSH_PER_MINUTE,
    max > 0 ? max : null,
  );
}

export function rushPricingMeta(): {
  diamondsPerMinute: number;
  maxPerAction: number | null;
} {
  const max = env.DIAMOND_RUSH_MAX_PER_ACTION;
  return {
    diamondsPerMinute: env.DIAMOND_RUSH_PER_MINUTE,
    maxPerAction: max > 0 ? max : null,
  };
}
