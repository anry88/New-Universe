import { eq, and, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { buildings, planets, systems } from '../../db/schema.js';

/** Count completed + in-queue buildings of a type across all planets owned by the user. */
export async function countUserBuildingsOfType(userId: string, typeId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(buildings)
    .innerJoin(planets, eq(planets.id, buildings.planetId))
    .innerJoin(systems, eq(systems.id, planets.systemId))
    .where(and(eq(systems.ownerId, userId), eq(buildings.typeId, typeId)));
  return Number(rows[0]?.count ?? 0);
}
