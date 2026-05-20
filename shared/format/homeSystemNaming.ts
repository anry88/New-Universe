/**
 * Home system / planet display naming shared by backend (generation, migrations)
 * and frontend (localized titles). Planet codes use `{shortTag}-{index}` (1-based index).
 */

export type HomeNamingLocale = 'en' | 'ru';

/** Four lowercase hex chars taken from the system UUID (deterministic, stable). */
export function homeSystemShortTag(systemId: string): string {
  return systemId.replace(/-/g, '').slice(0, 4).toLowerCase();
}

/**
 * Eight lowercase hex chars from the system UUID, split as `xxxx-xxxx`.
 * Used as the default *name* for newly generated home systems — only
 * random characters, no player slug. Older home systems keep whatever
 * `name` was stored at generation time (we never rename them).
 */
export function homeSystemRandomTag(systemId: string): string {
  const hex = systemId.replace(/-/g, '').slice(0, 8).toLowerCase();
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
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

/** Localized title for public common systems that are not owned by a player. */
export function formatCommonSystemDisplayName(
  locale: HomeNamingLocale,
  shortTag: string,
): string {
  if (locale === 'ru') {
    return `Система ${shortTag}`;
  }
  return `System ${shortTag}`;
}
