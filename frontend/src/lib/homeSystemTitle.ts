import type { User } from '@shared/types/user';

/**
 * Home system title shown above the planet rail on Home / PlanetView.
 *
 * Home system names are stored in the DB at generation time. New home
 * systems are auto-named with random characters (`xxxx-xxxx`); legacy
 * systems generated before the rename feature keep their original
 * "{slug}'s system" / "Система {slug}" wording. Players can also rename
 * the system. We always read the stored value rather than re-formatting
 * client-side, so all three cases render consistently.
 */
export function formatHomeSystemTitleForUser(
  user: Pick<User, 'homeSystem'>,
): string {
  return user.homeSystem?.name ?? '';
}
