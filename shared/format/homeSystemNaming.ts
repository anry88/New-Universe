/**
 * Home system / planet display naming shared by backend (generation, migrations)
 * and frontend (localized titles). Planet codes use `{shortTag}-{index}` (1-based index).
 */

export type HomeNamingLocale = 'en' | 'ru';

/** Four lowercase hex chars taken from the system UUID (deterministic, stable). */
export function homeSystemShortTag(systemId: string): string {
  return systemId.replace(/-/g, '').slice(0, 4).toLowerCase();
}

/** Safe player slug for titles; Telegram username preferred, then first name. */
export function sanitizePlayerSlug(
  tgUsername: string | null | undefined,
  tgFirstName: string | null | undefined,
): string {
  const raw = (tgUsername?.trim() || tgFirstName?.trim() || 'captain').replace(/^@/, '');
  const slug = raw.replace(/[^\p{L}\p{N}_-]/gu, '').slice(0, 24);
  return slug.length > 0 ? slug : 'captain';
}

export function formatPlanetCode(shortTag: string, planetIndexOneBased: number): string {
  return `${shortTag}-${planetIndexOneBased}`;
}

/**
 * Localized home system title (not stored per locale on the server — recomputed from user + shortTag).
 */
/** `playerSlug` should usually come from `sanitizePlayerSlug`. */
export function formatHomeSystemDisplayName(
  locale: HomeNamingLocale,
  playerSlug: string,
  shortTag: string,
): string {
  if (locale === 'ru') {
    return `Система ${playerSlug} ${shortTag}`;
  }
  const base = playerSlug.endsWith('s') ? `${playerSlug}'` : `${playerSlug}'s`;
  return `${base} system ${shortTag}`;
}
