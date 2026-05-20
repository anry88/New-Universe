import { and, eq, gte, ne, sql } from 'drizzle-orm';
import {
  validateEntityName,
  type EntityNameErrorCode,
} from '@shared/format/entityNameValidation.js';
import {
  PLANET_RENAME_DIAMOND_COST,
  SYSTEM_RENAME_DIAMOND_COST,
  type RenameBlockedCode,
  type RenameEntitySuccess,
} from '@shared/types/entity-rename.js';
import { db as defaultDb } from '../../db/index.js';
import { colonies, planets, systems, users } from '../../db/schema.js';

export type RenameErrorCode = EntityNameErrorCode | RenameBlockedCode;

export class RenameError extends Error {
  readonly code: RenameErrorCode;

  constructor(code: RenameErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

function nameErrorMessage(code: EntityNameErrorCode): string {
  switch (code) {
    case 'empty':
      return 'Name cannot be empty.';
    case 'too_long':
      return 'Name is too long (max 30 characters).';
    case 'invalid_chars':
      return 'Only Latin letters, digits, spaces and hyphens are allowed.';
    case 'profanity':
      return 'Name contains profanity.';
  }
}

function validateOrThrow(rawName: string): string {
  const result = validateEntityName(rawName);
  if (!result.valid) {
    throw new RenameError(result.error!, nameErrorMessage(result.error!));
  }
  return result.normalized;
}

/**
 * Renames a planet on which the requesting user owns an active colony.
 * First rename is free; subsequent renames cost diamonds. The counter
 * persists across colony ownership changes, so a hostile takeover does
 * not "reset" the price.
 */
export async function renamePlanet(
  userId: string,
  planetId: string,
  rawName: string,
): Promise<RenameEntitySuccess> {
  const normalized = validateOrThrow(rawName);

  return defaultDb.transaction(async (tx) => {
    const planetRow = await tx.query.planets.findFirst({
      where: eq(planets.id, planetId),
      columns: { id: true, renameCount: true },
    });

    if (!planetRow) {
      throw new RenameError('not_found', 'Planet not found.');
    }

    const colonyRow = await tx.query.colonies.findFirst({
      where: and(
        eq(colonies.planetId, planetId),
        eq(colonies.ownerId, userId),
        eq(colonies.status, 'active'),
      ),
      columns: { id: true },
    });

    if (!colonyRow) {
      throw new RenameError('not_owned', 'You can only rename planets you have colonized.');
    }

    const cost = planetRow.renameCount === 0 ? 0 : PLANET_RENAME_DIAMOND_COST;

    let diamondsRemaining: number;
    if (cost > 0) {
      const charged = await tx
        .update(users)
        .set({ diamonds: sql`${users.diamonds} - ${cost}` })
        .where(and(eq(users.id, userId), gte(users.diamonds, cost)))
        .returning({ diamonds: users.diamonds });

      if (charged.length === 0) {
        throw new RenameError('insufficient_diamonds', 'Not enough diamonds.');
      }
      diamondsRemaining = charged[0]!.diamonds;
    } else {
      const userRow = await tx.query.users.findFirst({
        where: eq(users.id, userId),
        columns: { diamonds: true },
      });
      diamondsRemaining = userRow?.diamonds ?? 0;
    }

    const [updated] = await tx
      .update(planets)
      .set({
        name: normalized,
        renameCount: sql`${planets.renameCount} + 1`,
      })
      .where(eq(planets.id, planetId))
      .returning({ name: planets.name, renameCount: planets.renameCount });

    if (!updated) {
      throw new RenameError('not_found', 'Planet not found.');
    }

    return {
      status: 'ok',
      name: updated.name,
      renameCount: updated.renameCount,
      diamondsSpent: cost,
      diamondsRemaining,
    };
  });
}

/**
 * Renames a system. Requires the requesting user to have at least one
 * active colony in the system, *and* no foreign player colonies present.
 * The rename counter is per-system (not per-player), so after a hostile
 * takeover the new colonist still pays for renames 2+.
 */
export async function renameSystem(
  userId: string,
  systemId: string,
  rawName: string,
): Promise<RenameEntitySuccess> {
  const normalized = validateOrThrow(rawName);

  return defaultDb.transaction(async (tx) => {
    const systemRow = await tx.query.systems.findFirst({
      where: eq(systems.id, systemId),
      columns: { id: true, renameCount: true },
    });

    if (!systemRow) {
      throw new RenameError('not_found', 'System not found.');
    }

    const [ownColonyCountRow] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(colonies)
      .innerJoin(planets, eq(colonies.planetId, planets.id))
      .where(
        and(
          eq(planets.systemId, systemId),
          eq(colonies.ownerId, userId),
          eq(colonies.status, 'active'),
        ),
      );

    if ((ownColonyCountRow?.count ?? 0) === 0) {
      throw new RenameError(
        'no_player_colony',
        'You need an active colony in this system to rename it.',
      );
    }

    const [foreignColonyCountRow] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(colonies)
      .innerJoin(planets, eq(colonies.planetId, planets.id))
      .where(
        and(
          eq(planets.systemId, systemId),
          ne(colonies.ownerId, userId),
          eq(colonies.status, 'active'),
        ),
      );

    if ((foreignColonyCountRow?.count ?? 0) > 0) {
      throw new RenameError(
        'foreign_colony_present',
        'Other players have colonies here; the system cannot be renamed.',
      );
    }

    const cost = systemRow.renameCount === 0 ? 0 : SYSTEM_RENAME_DIAMOND_COST;

    let diamondsRemaining: number;
    if (cost > 0) {
      const charged = await tx
        .update(users)
        .set({ diamonds: sql`${users.diamonds} - ${cost}` })
        .where(and(eq(users.id, userId), gte(users.diamonds, cost)))
        .returning({ diamonds: users.diamonds });

      if (charged.length === 0) {
        throw new RenameError('insufficient_diamonds', 'Not enough diamonds.');
      }
      diamondsRemaining = charged[0]!.diamonds;
    } else {
      const userRow = await tx.query.users.findFirst({
        where: eq(users.id, userId),
        columns: { diamonds: true },
      });
      diamondsRemaining = userRow?.diamonds ?? 0;
    }

    const [updated] = await tx
      .update(systems)
      .set({
        name: normalized,
        renameCount: sql`${systems.renameCount} + 1`,
      })
      .where(eq(systems.id, systemId))
      .returning({ name: systems.name, renameCount: systems.renameCount });

    if (!updated) {
      throw new RenameError('not_found', 'System not found.');
    }

    return {
      status: 'ok',
      name: updated.name,
      renameCount: updated.renameCount,
      diamondsSpent: cost,
      diamondsRemaining,
    };
  });
}
