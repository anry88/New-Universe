import { describe, expect, it } from 'vitest';
import {
  formatHomeSystemDisplayName,
  formatPlanetCode,
  homeSystemRandomTag,
  homeSystemShortTag,
  sanitizePlayerSlug,
} from '@shared/format/homeSystemNaming.js';

describe('homeSystemNaming', () => {
  it('homeSystemShortTag uses first four hex chars of UUID', () => {
    expect(homeSystemShortTag('550e8400-e29b-41d4-a716-446655440000')).toBe('550e');
  });

  it('homeSystemRandomTag splits 8 hex chars from the UUID with a hyphen', () => {
    expect(homeSystemRandomTag('550e8400-e29b-41d4-a716-446655440000')).toBe('550e-8400');
    expect(homeSystemRandomTag('7efa1234-abcd-ef00-1111-222233334444')).toBe('7efa-1234');
  });

  it('formatPlanetCode uses short tag and 1-based index', () => {
    expect(formatPlanetCode('7efa', 1)).toBe('7efa-1');
    expect(formatPlanetCode('7efa', 3)).toBe('7efa-3');
  });

  it('sanitizePlayerSlug prefers username (legacy helper still exported)', () => {
    expect(sanitizePlayerSlug('anry', 'Andrew')).toBe('anry');
  });

  it('formatHomeSystemDisplayName remains for backwards compatible rendering of legacy DB names', () => {
    expect(formatHomeSystemDisplayName('en', 'anry', '7efa')).toBe("anry's system 7efa");
    expect(formatHomeSystemDisplayName('ru', 'anry', '7efa')).toBe('Система anry 7efa');
  });
});
