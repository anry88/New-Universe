import type { NotificationPreferences } from './notifications.js';

export const SUPPORTED_LOCALES = ['en', 'ru'] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

export interface UpdatePreferredLocaleRequest {
  preferredLocale?: Locale;
  notificationPreferences?: Partial<NotificationPreferences>;
}

export interface UpdatePreferredLocaleResponse {
  preferredLocale: Locale;
  notificationPreferences: NotificationPreferences;
}

export function isSupportedLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'ru';
}

export function normalizeLocale(value: string | null | undefined): Locale {
  if (!value) return DEFAULT_LOCALE;

  const firstToken = value.split(',')[0]?.trim().toLowerCase() ?? '';
  if (firstToken.startsWith('ru')) return 'ru';
  return DEFAULT_LOCALE;
}
