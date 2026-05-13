/**
 * Multiplayer / sector map layer reuses existing normalized tables (`systems`,
 * `planets`, `colonies`, `ships`, `users`, `discovered_systems`) instead of
 * introducing a duplicate presence table. The constants below document the
 * source-of-truth model that `features/multiplayer/presence.ts` projects into
 * API payloads. Keep this file type-only so the Drizzle schema barrel does not
 * pass non-table runtime constants into `drizzle({ schema })`.
 */

export type MultiplayerPresenceEntityType = 'home' | 'colony' | 'fleet' | 'public_sector';

export type MultiplayerPresenceSourceTables = {
  home: ['systems'];
  colony: ['colonies', 'planets', 'systems', 'users'];
  fleet: ['ships', 'planets', 'systems', 'users'];
  public_sector: ['systems'];
};

export type MultiplayerProtectedHomeRule =
  'systems.is_home AND systems.owner_id != viewer_id => hidden';
