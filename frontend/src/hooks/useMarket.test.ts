import { describe, expect, it } from 'vitest';
import { normalizeMarketError } from './useMarket';

describe('normalizeMarketError', () => {
  it('maps insufficient resources errors', () => {
    expect(normalizeMarketError(new Error('not enough iron'))).toBe('Insufficient resources for this order.');
  });

  it('maps storage capacity errors', () => {
    expect(normalizeMarketError(new Error('Not enough storage capacity for buy order'))).toBe(
      'Not enough storage capacity for this buy order.'
    );
  });

  it('maps moved price errors', () => {
    expect(normalizeMarketError(new Error('Price moved, please refresh offers'))).toBe(
      'Market price changed. Refresh offers and try again.'
    );
  });
});
