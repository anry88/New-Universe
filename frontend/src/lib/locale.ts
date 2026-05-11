import { DEFAULT_LOCALE, isSupportedLocale, normalizeLocale, type Locale } from '@shared/types/locale';

const STORAGE_KEY = 'nu_preferred_locale';
const LEGACY_STORAGE_KEY = 'ui_locale';

export function readStoredLocale(): Locale | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY);
    return isSupportedLocale(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function persistUiLocale(locale: Locale): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, locale);
    window.localStorage.setItem(LEGACY_STORAGE_KEY, locale);
  } catch {
    /* private mode */
  }
}

export function getUiLocale(): Locale {
  return readStoredLocale() ?? DEFAULT_LOCALE;
}

export function normalizeUiLocale(value: string | null | undefined): Locale {
  return normalizeLocale(value);
}
