import { and, eq } from 'drizzle-orm';
import { db as defaultDb } from '../../db/index.js';
import { buildings, colonies, planets } from '../../db/schema.js';

export interface PlayerPlanetSettlement {
  planet: typeof planets.$inferSelect & {
    system: unknown;
    buildings: (typeof buildings.$inferSelect)[];
  };
  isCapital: boolean;
  isColony: boolean;
  isSettled: boolean;
  hasCommandCenter: boolean;
}

function hasOperationalCommandCenter(
  planetBuildings: (typeof buildings.$inferSelect)[] | undefined,
): boolean {
  return (
    planetBuildings?.some(
      (building) =>
        building.typeId === 'command_center' && building.queueAction !== 'build',
    ) ?? false
  );
}

export async function getPlayerPlanetSettlement(
  userId: string,
  planetId: string,
  database: any = defaultDb,
): Promise<PlayerPlanetSettlement | null> {
  const planet = await database.query.planets.findFirst({
    where: eq(planets.id, planetId),
    with: {
      system: true,
      buildings: true,
    },
  });

  if (!planet) return null;

  const colony = await database.query.colonies.findFirst({
    where: and(eq(colonies.ownerId, userId), eq(colonies.planetId, planetId)),
  });

  const system = (planet as any).system;
  const hasCommandCenter = hasOperationalCommandCenter((planet as any).buildings);
  const isCapital =
    system?.isHome === true && system?.ownerId === userId && hasCommandCenter;
  const isColony = colony?.ownerId === userId && colony.status === 'active';

  return {
    planet,
    isCapital,
    isColony,
    isSettled: isCapital || isColony,
    hasCommandCenter,
  };
}

export async function getPlanetSettlementOwnerId(
  planetId: string,
  database: any = defaultDb,
): Promise<string | null> {
  const colony = await database.query.colonies.findFirst({
    where: eq(colonies.planetId, planetId),
  });
  if (colony?.ownerId && colony.status === 'active') return colony.ownerId;

  const planet = await database.query.planets.findFirst({
    where: eq(planets.id, planetId),
    with: {
      system: true,
      buildings: true,
    },
  });
  if (!planet) return null;

  const system = (planet as any).system;
  if (
    system?.isHome === true &&
    system?.ownerId &&
    hasOperationalCommandCenter((planet as any).buildings)
  ) {
    return system.ownerId;
  }

  return null;
}
