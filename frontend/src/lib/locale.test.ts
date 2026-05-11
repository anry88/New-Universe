import { describe, expect, it } from 'vitest';
import { normalizeLocale } from '@shared/types/locale';

describe('normalizeLocale', () => {
  it('defaults to English for empty or unsupported locales', () => {
    expect(normalizeLocale(undefined)).toBe('en');
    expect(normalizeLocale('de-DE')).toBe('en');
  });

  it('resolves Russian from Telegram and Accept-Language formats', () => {
    expect(normalizeLocale('ru')).toBe('ru');
    expect(normalizeLocale('ru-RU')).toBe('ru');
    expect(normalizeLocale('ru-RU,ru;q=0.9,en;q=0.8')).toBe('ru');
  });
});
