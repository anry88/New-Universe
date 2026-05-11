import { eq, and, or, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { buildings, colonies, planets, systems } from '../../db/schema.js';

/** Count completed + in-queue buildings of a type across all planets owned by the user. */
export async function countUserBuildingsOfType(userId: string, typeId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(buildings)
    .innerJoin(planets, eq(planets.id, buildings.planetId))
    .innerJoin(systems, eq(systems.id, planets.systemId))
    .leftJoin(colonies, eq(colonies.planetId, planets.id))
    .where(
      and(
        or(eq(systems.ownerId, userId), eq(colonies.ownerId, userId)),
        eq(buildings.typeId, typeId),
      ),
    );
  return Number(rows[0]?.count ?? 0);
}
