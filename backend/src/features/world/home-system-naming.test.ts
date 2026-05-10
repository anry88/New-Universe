import { describe, expect, it } from 'vitest';
import {
  formatHomeSystemDisplayName,
  formatPlanetCode,
  homeSystemShortTag,
  sanitizePlayerSlug,
} from '@shared/format/homeSystemNaming.js';

describe('homeSystemNaming', () => {
  it('homeSystemShortTag uses first four hex chars of UUID', () => {
    expect(homeSystemShortTag('550e8400-e29b-41d4-a716-446655440000')).toBe('550e');
  });

  it('formatPlanetCode uses short tag and 1-based index', () => {
    expect(formatPlanetCode('7efa', 1)).toBe('7efa-1');
    expect(formatPlanetCode('7efa', 3)).toBe('7efa-3');
  });

  it('sanitizePlayerSlug prefers username', () => {
    expect(sanitizePlayerSlug('anry', 'Andrew')).toBe('anry');
  });

  it('formatHomeSystemDisplayName EN/RU templates', () => {
    expect(formatHomeSystemDisplayName('en', 'anry', '7efa')).toBe("anry's system 7efa");
    expect(formatHomeSystemDisplayName('ru', 'anry', '7efa')).toBe('Система anry 7efa');
  });

  it('EN possessive for names ending in s uses apostrophe only', () => {
    expect(formatHomeSystemDisplayName('en', 'boss', 'abcd')).toBe("boss' system abcd");
  });
});
