import { describe, expect, it } from 'vitest';
import {
  MAX_ENTITY_NAME_LENGTH,
  containsProfanity,
  validateEntityName,
} from '@shared/format/entityNameValidation.js';

describe('validateEntityName', () => {
  it('accepts simple Latin names', () => {
    expect(validateEntityName('New Eden')).toEqual({
      valid: true,
      normalized: 'New Eden',
    });
    expect(validateEntityName('XJ-9 Reach')).toEqual({
      valid: true,
      normalized: 'XJ-9 Reach',
    });
  });

  it('trims surrounding whitespace and collapses interior runs', () => {
    expect(validateEntityName('  alpha   one  ')).toEqual({
      valid: true,
      normalized: 'alpha one',
    });
  });

  it('rejects an empty name', () => {
    expect(validateEntityName('   ')).toEqual({
      valid: false,
      error: 'empty',
      normalized: '',
    });
  });

  it('rejects names longer than the global maximum', () => {
    const tooLong = 'a'.repeat(MAX_ENTITY_NAME_LENGTH + 1);
    expect(validateEntityName(tooLong).error).toBe('too_long');
  });

  it('rejects Cyrillic input with invalid_chars', () => {
    expect(validateEntityName('Земля').error).toBe('invalid_chars');
  });

  it('rejects punctuation outside the allowed set', () => {
    expect(validateEntityName('Tycho_Crater').error).toBe('invalid_chars');
    expect(validateEntityName('alpha!').error).toBe('invalid_chars');
  });

  it('catches transliterated Russian profanity', () => {
    expect(validateEntityName('blyad').error).toBe('profanity');
    expect(validateEntityName('huy planet').error).toBe('profanity');
    expect(validateEntityName('PiZdEc').error).toBe('profanity');
  });

  it('catches Cyrillic profanity (via invalid_chars or profanity)', () => {
    const result = validateEntityName('блядь');
    expect(['invalid_chars', 'profanity']).toContain(result.error);
  });

  it('catches English profanity with leet/run noise', () => {
    expect(validateEntityName('fuuuuck off').error).toBe('profanity');
    expect(validateEntityName('5h1t storm').error).toBe('profanity');
  });

  it('exposes containsProfanity for direct checks', () => {
    expect(containsProfanity('cyka')).toBe(true);
    expect(containsProfanity('peaceful')).toBe(false);
  });
});
