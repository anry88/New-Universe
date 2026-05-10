import { db as defaultDb } from '../../db/index.js';
import { systems, planets, discoveredPlanets, discoveredSystems, ships, shipTypes } from '../../db/schema.js';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { applySensorRange, getResearchEffectsForUser } from '../research/effects.js';

export interface Discovery {
  type: 'planet' | 'system';
  id: string;
  name: string;
}

interface ShipPosition {
  ownerId: string;
  shipSectorX: number | null;
  shipSectorY: number | null;
  shipSectorZ: number | null;
  sensorRange: number;
}

interface SystemRow {
  id: string;
  name: string;
  sectorX: number;
  sectorY: number;
  sectorZ: number;
  ownerId: string | null;
  isHome: boolean;
}

interface PlanetRow {
  id: string;
  name: string;
  systemId: string;
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
 *
 * @param shipId Ship ID
 * @param tx Optional transaction
 * @param overrideCoords Optional coordinates to use instead of ship's current planet position (for in-flight ships)
 */
export async function checkVisibility(
  shipId: string,
  tx?: any,
  overrideCoords?: { x: number; y: number; z: number },
): Promise<Discovery[]> {
  const database = tx || defaultDb;

  const [ship] = await database
    .select({
      ownerId: ships.ownerId,
      shipSectorX: systems.sectorX,
      shipSectorY: systems.sectorY,
      shipSectorZ: systems.sectorZ,
      sensorRange: shipTypes.sensorRange,
      shipTypeId: ships.typeId,
      shipRole: shipTypes.role,
    })
    .from(ships)
    .innerJoin(shipTypes, eq(shipTypes.id, ships.typeId))
    .leftJoin(planets, eq(planets.id, ships.locationPlanetId))
    .leftJoin(systems, eq(systems.id, planets.systemId))
    .where(eq(ships.id, shipId))
    .limit(1) as ShipPosition[];

  if (!ship || !ship.ownerId) {
    return [];
  }

  const { ownerId } = ship;
  const researchEffects = await getResearchEffectsForUser(ownerId, database);
  const range = applySensorRange(Number(ship.sensorRange), researchEffects);

  let shipSectorX = ship.shipSectorX;
  let shipSectorY = ship.shipSectorY;
  let shipSectorZ = ship.shipSectorZ;

  if (overrideCoords) {
    shipSectorX = overrideCoords.x;
    shipSectorY = overrideCoords.y;
    shipSectorZ = overrideCoords.z;
  }

  if (shipSectorX == null || shipSectorY == null || shipSectorZ == null) {
    return [];
  }

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
    ) as SystemRow[];

  const visibleSystems = candidateSystems.filter((sys: SystemRow) => {
    if (sys.isHome && sys.ownerId && sys.ownerId !== ownerId) {
      return false;
    }
    const dx = Number(sys.sectorX) - Number(shipSectorX);
    const dy = Number(sys.sectorY) - Number(shipSectorY);
    const dz = Number(sys.sectorZ) - Number(shipSectorZ);
    return Math.sqrt(dx * dx + dy * dy + dz * dz) <= range;
  });

  if (visibleSystems.length === 0) return [];

  const visibleSystemIds = visibleSystems.map((s: SystemRow) => s.id);

  const existingSysRows = await database
    .select({ systemId: discoveredSystems.systemId })
    .from(discoveredSystems)
    .where(
      and(
        eq(discoveredSystems.userId, ownerId),
        inArray(discoveredSystems.systemId, visibleSystemIds),
      ),
    ) as { systemId: string }[];
  const alreadyKnownSys = new Set(existingSysRows.map((r: { systemId: string }) => r.systemId));

  const allPlanets = await database
    .select({ id: planets.id, name: planets.name, systemId: planets.systemId })
    .from(planets)
    .where(inArray(planets.systemId, visibleSystemIds)) as PlanetRow[];

  const allPlanetIds = allPlanets.map((p: PlanetRow) => p.id);
  const existingPlanetRows: { planetId: string }[] = [];
  if (allPlanetIds.length > 0) {
    const rows = await database
      .select({ planetId: discoveredPlanets.planetId })
      .from(discoveredPlanets)
      .where(
        and(
          eq(discoveredPlanets.userId, ownerId),
          inArray(discoveredPlanets.planetId, allPlanetIds),
        ),
      ) as { planetId: string }[];
    existingPlanetRows.push(...rows);
  }
  const alreadyKnownPlanets = new Set(existingPlanetRows.map((r: { planetId: string }) => r.planetId));

  const systemById = new Map(visibleSystems.map((s: SystemRow) => [s.id, s]));

  const newSystems = visibleSystems.filter((sys: SystemRow) => !alreadyKnownSys.has(sys.id));
  const newPlanets = allPlanets
    .filter((p: PlanetRow) => !alreadyKnownPlanets.has(p.id))
    .filter((p: PlanetRow) => {
      const sys = systemById.get(p.systemId);
      if (!sys?.isHome || sys.ownerId !== ownerId) return true;
      // Passive sensors now reveal bodies in your own home system IF you are using a recon ship.
      // This satisfies "ships flying past undiscovered planets should discover them".
      return (ship as any).shipRole === 'recon';
    });

  if (newSystems.length > 0) {
    await database.insert(discoveredSystems).values(
      newSystems.map((sys: SystemRow) => ({ userId: ownerId, systemId: sys.id })),
    );
  }
  if (newPlanets.length > 0) {
    await database.insert(discoveredPlanets).values(
      newPlanets.map((p: PlanetRow) => ({ userId: ownerId, planetId: p.id })),
    );
  }

  return [
    ...newSystems.map((sys: SystemRow) => ({ type: 'system' as const, id: sys.id, name: sys.name })),
    ...newPlanets.map((p: PlanetRow) => ({ type: 'planet' as const, id: p.id, name: p.name })),
  ];
}
