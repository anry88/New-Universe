/** UI locale for Cosmic copy until a dedicated i18n layer owns persistence (see P2.1-402). */
export type UiLocale = 'en' | 'ru';

export function getUiLocale(): UiLocale {
  if (typeof window === 'undefined') return 'en';
  try {
    const stored = window.localStorage.getItem('ui_locale');
    if (stored === 'ru' || stored === 'en') return stored;
  } catch {
    /* private mode / SSR */
  }
  if (typeof navigator !== 'undefined') {
    const nav = navigator.language?.toLowerCase() ?? 'en';
    if (nav.startsWith('ru')) return 'ru';
  }
  return 'en';
}
