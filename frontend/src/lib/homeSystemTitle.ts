import type { User } from '@shared/types/user';
import {
  formatHomeSystemDisplayName,
  homeSystemShortTag,
  sanitizePlayerSlug,
} from '@shared/format/homeSystemNaming';
import { getUiLocale } from './uiLocale';

/** Localized home system banner title from `/me` user + home system ids. */
export function formatHomeSystemTitleForUser(user: Pick<User, 'tgUsername' | 'tgFirstName' | 'homeSystem'>): string {
  const hs = user.homeSystem;
  if (!hs) return '';
  const shortTag = hs.shortTag ?? homeSystemShortTag(hs.id);
  const slug = sanitizePlayerSlug(user.tgUsername, user.tgFirstName);
  return formatHomeSystemDisplayName(getUiLocale(), slug, shortTag);
}
