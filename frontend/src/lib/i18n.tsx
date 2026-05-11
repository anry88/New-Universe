import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { Locale } from '@shared/types/locale';
import en from '../locales/en.json';
import ru from '../locales/ru.json';
import { getUiLocale, persistUiLocale } from './locale';

type Dictionary = Record<string, string>;
type Params = Record<string, string | number>;

const dictionaries: Record<Locale, Dictionary> = {
  en,
  ru,
};

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale, options?: { persist?: boolean }) => void;
  t: (key: string, params?: Params) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function translate(locale: Locale, key: string, params?: Params): string {
  const template = dictionaries[locale][key] ?? dictionaries.en[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, paramName: string) => {
    const value = params[paramName];
    return value === undefined ? `{${paramName}}` : String(value);
  });
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => getUiLocale());

  const setLocale = useCallback((nextLocale: Locale, options?: { persist?: boolean }) => {
    setLocaleState(nextLocale);
    if (options?.persist !== false) {
      persistUiLocale(nextLocale);
    }
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, params) => translate(locale, key, params),
    }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used inside I18nProvider');
  }
  return context;
}
