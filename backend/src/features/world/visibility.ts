import { db as defaultDb } from '../../db/index.js';
import { systems, planets, discoveredPlanets, discoveredSystems, ships, shipTypes } from '../../db/schema.js';
import { eq, and, inArray, sql } from 'drizzle-orm';

export interface Discovery {
  type: 'planet' | 'system';
  id: string;
  name: string;
}

/**
 * Check visibility for a ship at its current position.
 *
 * Finds all systems (and their planets) within Euclidean distance of
 * `ship.sensorRange` that are not yet discovered by the ship's owner.
 * Skips foreign home systems (someone else's home system is never visible).
 *
 * Returns the array of newly discovered entities.
 * Used by the expedition tick worker (`tick_expeditions`).
 */
export async function checkVisibility(shipId: string, tx?: any): Promise<Discovery[]> {
  const database = tx || defaultDb;

  const [ship] = await database
    .select({
      ownerId: ships.ownerId,
      shipSectorX: systems.sectorX,
      shipSectorY: systems.sectorY,
      shipSectorZ: systems.sectorZ,
      sensorRange: shipTypes.sensorRange,
    })
    .from(ships)
    .innerJoin(shipTypes, eq(shipTypes.id, ships.typeId))
    .innerJoin(planets, eq(planets.id, ships.locationPlanetId))
    .innerJoin(systems, eq(systems.id, planets.systemId))
    .where(eq(ships.id, shipId))
    .limit(1);

  if (!ship || ship.shipSectorX == null || !ship.ownerId) {
    return [];
  }

  const { ownerId, shipSectorX, shipSectorY, shipSectorZ } = ship;
  const range = Number(ship.sensorRange);

  const candidateSystems = await database
    .select({
      id: systems.id,
      name: systems.name,
      sectorX: systems.sectorX,
      sectorY: systems.sectorY,
      sectorZ: systems.sectorZ,
      ownerId: systems.ownerId,
      isHome: systems.isHome,
    })
    .from(systems)
    .where(
      and(
        sql`${systems.sectorX} >= ${shipSectorX - range}`,
        sql`${systems.sectorX} <= ${shipSectorX + range}`,
        sql`${systems.sectorY} >= ${shipSectorY - range}`,
        sql`${systems.sectorY} <= ${shipSectorY + range}`,
        sql`${systems.sectorZ} >= ${shipSectorZ - range}`,
        sql`${systems.sectorZ} <= ${shipSectorZ + range}`,
      ),
    );

  const visibleSystems = candidateSystems.filter((sys) => {
    if (sys.isHome && sys.ownerId && sys.ownerId !== ownerId) {
      return false;
    }
    const dx = Number(sys.sectorX) - Number(shipSectorX);
    const dy = Number(sys.sectorY) - Number(shipSectorY);
    const dz = Number(sys.sectorZ) - Number(shipSectorZ);
    return Math.sqrt(dx * dx + dy * dy + dz * dz) <= range;
  });

  if (visibleSystems.length === 0) return [];

  const visibleSystemIds = visibleSystems.map((s) => s.id);

  const existingSysRows = await database
    .select({ systemId: discoveredSystems.systemId })
    .from(discoveredSystems)
    .where(
      and(
        eq(discoveredSystems.userId, ownerId),
        inArray(discoveredSystems.systemId, visibleSystemIds),
      ),
    );
  const alreadyKnownSys = new Set(existingSysRows.map((r) => r.systemId));

  const allPlanets = await database
    .select({ id: planets.id, name: planets.name, systemId: planets.systemId })
    .from(planets)
    .where(inArray(planets.systemId, visibleSystemIds));

  const allPlanetIds = allPlanets.map((p) => p.id);
  let existingPlanetRows: { planetId: string }[] = [];
  if (allPlanetIds.length > 0) {
    existingPlanetRows = await database
      .select({ planetId: discoveredPlanets.planetId })
      .from(discoveredPlanets)
      .where(
        and(
          eq(discoveredPlanets.userId, ownerId),
          inArray(discoveredPlanets.planetId, allPlanetIds),
        ),
      );
  }
  const alreadyKnownPlanets = new Set(existingPlanetRows.map((r) => r.planetId));

  const newSystems = visibleSystems.filter((sys) => !alreadyKnownSys.has(sys.id));
  const newPlanets = allPlanets.filter((p) => !alreadyKnownPlanets.has(p.id));

  if (newSystems.length > 0) {
    await database.insert(discoveredSystems).values(
      newSystems.map((sys) => ({ userId: ownerId, systemId: sys.id })),
    );
  }
  if (newPlanets.length > 0) {
    await database.insert(discoveredPlanets).values(
      newPlanets.map((p) => ({ userId: ownerId, planetId: p.id })),
    );
  }

  return [
    ...newSystems.map((sys) => ({ type: 'system' as const, id: sys.id, name: sys.name })),
    ...newPlanets.map((p) => ({ type: 'planet' as const, id: p.id, name: p.name })),
  ];
}
