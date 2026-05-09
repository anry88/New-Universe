import { describe, expect, it } from 'vitest';
import {
  MARKET_ORDER_STATUS_TRANSITIONS,
  canTransitionMarketOrderStatus,
} from './types.js';

describe('market order state transitions', () => {
  it('allows open -> partially_filled -> filled -> settled path', () => {
    expect(canTransitionMarketOrderStatus('open', 'partially_filled')).toBe(true);
    expect(canTransitionMarketOrderStatus('partially_filled', 'filled')).toBe(true);
    expect(canTransitionMarketOrderStatus('filled', 'settled')).toBe(true);
  });

  it('rejects illegal transitions from terminal states', () => {
    expect(canTransitionMarketOrderStatus('cancelled', 'open')).toBe(false);
    expect(canTransitionMarketOrderStatus('expired', 'settled')).toBe(false);
    expect(canTransitionMarketOrderStatus('failed', 'filled')).toBe(false);
  });

  it('keeps transition map explicit for every status', () => {
    expect(Object.keys(MARKET_ORDER_STATUS_TRANSITIONS).sort()).toEqual([
      'cancelled',
      'expired',
      'failed',
      'filled',
      'open',
      'partially_filled',
      'settled',
    ]);
  });
});
