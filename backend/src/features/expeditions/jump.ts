import type {
  JumpGateJumpResponse,
  JumpGateKnownDestinationSummary,
} from '@shared/types/jump-gate.js';
import {
  JUMP_FUEL_RESOURCE_ID,
  JUMP_GATE_JUMP_FUEL_COST,
} from '@shared/config/expeditionRouting.js';
import {
  formatCommonSystemDisplayName,
  homeSystemShortTag,
} from '@shared/format/homeSystemNaming.js';
import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import { db as defaultDb } from '../../db/index.js';
import {
  colonies,
  discoveredSystems,
  jumpGates,
  planets,
  planetResources,
  ships,
  shipTypes,
  systems,
  users,
} from '../../db/schema.js';
import { getJumpGateState } from '../jump-gate/service.js';
import {
  COMMON_POOL_INITIAL_SYSTEM_COUNT,
  countCommonPoolSectors,
  countCommonPoolSystems,
  createCommonPoolSystems,
} from '../world/sector-generator.js';
import { spendResources } from '../resources/transactions.js';
import { formatInsufficientResourceMessage, shipLabel } from '@shared/types/entity-labels.js';
import type { JumpGateAvailabilityBlockedCode } from '@shared/types/jump-gate.js';

export interface JumpRequest {
  shipId: string;
  mode?: 'random';
  destinationSystemId?: string;
  /** @deprecated Manual target sectors are rejected by the new Jump Gate model. */
  targetSector?: {
    x: number;
    y: number;
    z: number;
  };
}

export interface JumpResult extends Partial<JumpGateJumpResponse> {
  success: boolean;
  status: number;
  error?: string;
  targetPlanet?: typeof planets.$inferSelect;
}

export interface JumpShipOptions {
  now?: Date;
  database?: typeof defaultDb;
}

type LoadedShipContext = {
  shipRow: typeof ships.$inferSelect;
};

type LoadShipContextResult = LoadedShipContext | { error: JumpResult };

const DISCOVERY_PROBE_TYPE_ID = 'recon_probe';
const RANDOM_JUMP_BASE_OPEN_LIMIT = 5;
const RANDOM_JUMP_LIMIT_REACHED_MESSAGE =
  'Random discovery limit reached. Colonize a planet in one of your opened public systems to unlock another random system.';

function randomJumpBlockedMessage(code: JumpGateAvailabilityBlockedCode | null): string {
  switch (code) {
    case 'jump_drive_required':
      return 'Jump Drive research level 1 required';
    case 'calibration_in_progress':
      return 'Jump Gate calibration is still in progress';
    case 'random_jump_cooldown':
      return 'Random jump is still on cooldown.';
    case 'home_system_missing':
      return 'Home system is unavailable.';
    default:
      return 'Random jump is unavailable.';
  }
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return hash;
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function isPublicSystem(system: typeof systems.$inferSelect): boolean {
  return !system.isHome && !system.ownerId;
}

function sortSystemsForJump(
  sectorSystems: (typeof systems.$inferSelect)[],
  seed: string,
): (typeof systems.$inferSelect)[] {
  const targetableSystems = sectorSystems
    .filter(isPublicSystem)
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

  if (targetableSystems.length <= 1) return targetableSystems;

  const startIndex = positiveModulo(hashString(seed), targetableSystems.length);
  return [
    ...targetableSystems.slice(startIndex),
    ...targetableSystems.slice(0, startIndex),
  ];
}

function summarizeTargetSystem(system: typeof systems.$inferSelect) {
  const shortTag = homeSystemShortTag(system.id);
  return {
    id: system.id,
    name: formatCommonSystemDisplayName('en', shortTag),
    shortTag,
    sector: {
      x: system.sectorX,
      y: system.sectorY,
      z: system.sectorZ,
    },
  };
}

function serializeDestination(
  system: typeof systems.$inferSelect,
  planetCount: number,
  row: typeof discoveredSystems.$inferSelect,
): JumpGateKnownDestinationSummary {
  const shortTag = homeSystemShortTag(system.id);
  return {
    systemId: system.id,
    systemName: formatCommonSystemDisplayName('en', shortTag),
    shortTag,
    sector: {
      x: system.sectorX,
      y: system.sectorY,
      z: system.sectorZ,
    },
    seed: system.seed,
    planetCount,
    planets: [],
    discoveredAt: row.discoveredAt.toISOString(),
    source: row.source,
    lastVisitedAt: row.lastVisitedAt?.toISOString() ?? null,
  };
}

async function loadShipContext(
  userId: string,
  shipId: string,
  database: typeof defaultDb,
): Promise<LoadShipContextResult> {
  const shipRow = await database.query.ships.findFirst({
    where: and(eq(ships.id, shipId), eq(ships.ownerId, userId)),
  });

  if (!shipRow) {
    return { error: { success: false, status: 404, error: 'Ship not found.' } as JumpResult };
  }

  if (shipRow.status !== 'idle') {
    return {
      error: {
        success: false,
        status: 400,
        error: 'Ship is already assigned to another mission.',
      } as JumpResult,
    };
  }

  if (!shipRow.locationPlanetId) {
    return {
      error: {
        success: false,
        status: 400,
        error: 'Ship must be docked at a planet before launch.',
      } as JumpResult,
    };
  }

  const originPlanet = await database.query.planets.findFirst({
    where: eq(planets.id, shipRow.locationPlanetId),
    with: { system: true },
  });

  if (!originPlanet?.system) {
    return {
      error: {
        success: false,
        status: 400,
        error: 'Launch planet is unavailable.',
      } as JumpResult,
    };
  }

  const jumpFuel = await database.query.planetResources.findFirst({
    where: and(
      eq(planetResources.planetId, originPlanet.id),
      eq(planetResources.resourceId, JUMP_FUEL_RESOURCE_ID),
    ),
  });
  if (Number(jumpFuel?.amount ?? 0) < JUMP_GATE_JUMP_FUEL_COST) {
    return {
      error: {
        success: false,
        status: 400,
        error: formatInsufficientResourceMessage(JUMP_FUEL_RESOURCE_ID, 'en'),
      } as JumpResult,
    };
  }

  return { shipRow };
}

async function countUsers(
  database: typeof defaultDb,
): Promise<number> {
  const [row] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(users);

  return Number(row?.count ?? 0);
}

async function countKnownPublicDestinations(
  userId: string,
  database: typeof defaultDb,
): Promise<number> {
  const [row] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(discoveredSystems)
    .innerJoin(systems, eq(discoveredSystems.systemId, systems.id))
    .where(and(
      eq(discoveredSystems.userId, userId),
      eq(systems.isHome, false),
      isNull(systems.ownerId),
    ));

  return Number(row?.count ?? 0);
}

async function countColonizedKnownPublicSystems(
  userId: string,
  database: typeof defaultDb,
): Promise<number> {
  const [row] = await database
    .select({ count: sql<number>`count(distinct ${systems.id})::int` })
    .from(colonies)
    .innerJoin(planets, eq(colonies.planetId, planets.id))
    .innerJoin(systems, eq(planets.systemId, systems.id))
    .innerJoin(
      discoveredSystems,
      and(
        eq(discoveredSystems.systemId, systems.id),
        eq(discoveredSystems.userId, userId),
      ),
    )
    .where(and(
      eq(colonies.ownerId, userId),
      eq(colonies.status, 'active'),
      eq(systems.isHome, false),
      isNull(systems.ownerId),
    ));

  return Number(row?.count ?? 0);
}

async function hasForeignShipsInSystem(
  userId: string,
  systemId: string,
  database: typeof defaultDb,
): Promise<boolean> {
  const [foreignShip] = await database
    .select({ id: ships.id })
    .from(ships)
    .innerJoin(planets, eq(ships.locationPlanetId, planets.id))
    .where(and(
      eq(planets.systemId, systemId),
      ne(ships.ownerId, userId),
      ne(ships.status, 'destroyed'),
    ))
    .limit(1);

  return Boolean(foreignShip);
}

async function ensureCommonPoolCapacity(database: typeof defaultDb) {
  const [currentSystemCount, currentSectorCount, playerCount] = await Promise.all([
    countCommonPoolSystems(database),
    countCommonPoolSectors(database),
    countUsers(database),
  ]);
  const systemsToCreate = currentSystemCount === 0 ? COMMON_POOL_INITIAL_SYSTEM_COUNT : 0;

  if (systemsToCreate > 0) {
    await createCommonPoolSystems(systemsToCreate, database);
  }

  const projectedSectorCount = currentSystemCount === 0 ? 1 : currentSectorCount;
  if (playerCount > projectedSectorCount) {
    await createCommonPoolSystems(1, database, { forceNewSector: true });
  }
}

async function loadUndiscoveredPublicSystems(
  userId: string,
  database: typeof defaultDb,
): Promise<(typeof systems.$inferSelect)[]> {
  const [publicSystems, knownRows] = await Promise.all([
    database.query.systems.findMany({
      where: and(
        eq(systems.isHome, false),
        isNull(systems.ownerId),
      ),
    }),
    database
      .select({ systemId: discoveredSystems.systemId })
      .from(discoveredSystems)
      .where(eq(discoveredSystems.userId, userId)),
  ]);

  const knownSystemIds = new Set(knownRows.map((row) => row.systemId));
  return publicSystems.filter((system) => !knownSystemIds.has(system.id));
}

async function loadRandomJumpLimitState(
  userId: string,
  database: typeof defaultDb,
) {
  const [openedCount, colonizedKnownSystemCount] = await Promise.all([
    countKnownPublicDestinations(userId, database),
    countColonizedKnownPublicSystems(userId, database),
  ]);

  const openLimit = RANDOM_JUMP_BASE_OPEN_LIMIT + colonizedKnownSystemCount;

  return {
    openedCount,
    colonizedKnownSystemCount,
    openLimit,
    reached: openedCount >= openLimit,
  };
}

async function resolveRandomTargetSystem(
  userId: string,
  shipId: string,
  now: Date,
  database: typeof defaultDb,
  requireNoForeignShips: boolean,
) {
  await ensureCommonPoolCapacity(database);

  let candidateSystems = await loadUndiscoveredPublicSystems(userId, database);

  if (requireNoForeignShips) {
    const shipFreeCandidates = [];
    for (const candidateSystem of candidateSystems) {
      if (!(await hasForeignShipsInSystem(userId, candidateSystem.id, database))) {
        shipFreeCandidates.push(candidateSystem);
      }
    }
    candidateSystems = shipFreeCandidates;
  }

  if (candidateSystems.length === 0) {
    const [newSystem] = await createCommonPoolSystems(1, database);
    if (!newSystem) return null;
    return newSystem;
  }

  return sortSystemsForJump(
    candidateSystems,
    `${userId}:${shipId}:${now.toISOString()}`,
  )[0] ?? null;
}

async function resolveKnownTargetSystem(
  userId: string,
  destinationSystemId: string,
  database: typeof defaultDb,
): Promise<typeof systems.$inferSelect | JumpResult> {
  const knownDestination = await database.query.discoveredSystems.findFirst({
    where: and(
      eq(discoveredSystems.userId, userId),
      eq(discoveredSystems.systemId, destinationSystemId),
    ),
  });

  if (!knownDestination) {
    return {
      success: false,
      status: 404,
      error: 'This Jump Gate destination is no longer available.',
    };
  }

  const targetSystem = await database.query.systems.findFirst({
    where: and(
      eq(systems.id, destinationSystemId),
      eq(systems.isHome, false),
      isNull(systems.ownerId),
    ),
  });

  if (!targetSystem) {
    return {
      success: false,
      status: 400,
      error: 'Jump Gate destination must be a public common system.',
    };
  }

  return targetSystem;
}

async function loadArrivalPlanet(
  targetSystemId: string,
  database: typeof defaultDb,
): Promise<typeof planets.$inferSelect | JumpResult> {
  const systemPlanets = await database.query.planets.findMany({
    where: eq(planets.systemId, targetSystemId),
  });

  const [targetPlanet] = systemPlanets.sort(
    (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );

  if (!targetPlanet) {
    return {
      success: false,
      status: 500,
      error: 'Destination system has no planets.',
    };
  }

  return targetPlanet;
}

async function jumpToSystem(params: {
  userId: string;
  shipRow: typeof ships.$inferSelect;
  targetSystem: typeof systems.$inferSelect;
  targetPlanet: typeof planets.$inferSelect;
  source: 'random_jump' | 'known_destination';
  consumeShip: boolean;
  now: Date;
  database: typeof defaultDb;
}): Promise<JumpResult> {
  const {
    userId,
    shipRow,
    targetSystem,
    targetPlanet,
    source,
    consumeShip,
    now,
    database,
  } = params;

  const [{ count: planetCount }] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(planets)
    .where(eq(planets.systemId, targetSystem.id));

  const result = await database.transaction(async (tx) => {
    const shipTypeId = shipRow.typeId;
    const shipType = await tx.query.shipTypes.findFirst({
      where: eq(shipTypes.id, shipTypeId),
    });

    if (!shipType) {
      throw new Error(`Ship type ${shipTypeId} not found`);
    }

    const currentJumpFuel = Number(shipRow.jumpFuel);
    const jumpFuelCapacity = shipType.jumpFuelCapacity;

    if (JUMP_GATE_JUMP_FUEL_COST > jumpFuelCapacity) {
      return {
        success: false,
        status: 400,
        error: `Ship jump fuel capacity (${jumpFuelCapacity}) is insufficient for this jump (cost ${JUMP_GATE_JUMP_FUEL_COST}).`,
      } satisfies JumpResult;
    }

    const fuelToLoad = Math.max(0, JUMP_GATE_JUMP_FUEL_COST - currentJumpFuel);
    
    const jumpFuelRow = await tx.query.planetResources.findFirst({
      where: and(
        eq(planetResources.planetId, shipRow.locationPlanetId!),
        eq(planetResources.resourceId, JUMP_FUEL_RESOURCE_ID)
      )
    });
    const availableJumpFuel = Number(jumpFuelRow?.amount ?? 0);
    const actualLoad = Math.min(availableJumpFuel, fuelToLoad);

    if (currentJumpFuel + actualLoad < JUMP_GATE_JUMP_FUEL_COST) {
      return {
        success: false,
        status: 400,
        error: formatInsufficientResourceMessage(JUMP_FUEL_RESOURCE_ID, 'en'),
      } satisfies JumpResult;
    }

    // Debit from planet to fill tank
    if (actualLoad > 0) {
      const jumpFuelSpend = await spendResources(
        shipRow.locationPlanetId!,
        [{ resourceId: JUMP_FUEL_RESOURCE_ID, amount: actualLoad }],
        tx,
      );
      if (!jumpFuelSpend.success) {
        return {
          success: false,
          status: 400,
          error: jumpFuelSpend.error ?? `not enough ${JUMP_FUEL_RESOURCE_ID}`,
        } satisfies JumpResult;
      }
    }

    const changedShips = consumeShip
      ? await tx
          .delete(ships)
          .where(and(
            eq(ships.id, shipRow.id),
            eq(ships.ownerId, userId),
            eq(ships.status, 'idle'),
          ))
          .returning()
      : await tx
          .update(ships)
          .set({
            locationPlanetId: targetPlanet.id,
            jumpFuel: sql`${ships.jumpFuel} + ${actualLoad} - ${JUMP_GATE_JUMP_FUEL_COST}`,
          })
          .where(and(
            eq(ships.id, shipRow.id),
            eq(ships.ownerId, userId),
            eq(ships.status, 'idle'),
          ))
          .returning();
    const [changedShip] = changedShips;

    if (!changedShip) {
      throw new Error('Ship state changed before jump could be committed');
    }

    const destinationInsert = tx
      .insert(discoveredSystems)
      .values({
        userId,
        systemId: targetSystem.id,
        source: source === 'random_jump' ? 'random_jump' : 'sensor',
        lastVisitedAt: now,
      });

    const [knownDestination] = await (
      source === 'random_jump'
        ? destinationInsert.onConflictDoUpdate({
            target: [discoveredSystems.userId, discoveredSystems.systemId],
            set: {
              source: 'random_jump',
              lastVisitedAt: now,
            },
          })
        : destinationInsert.onConflictDoUpdate({
            target: [discoveredSystems.userId, discoveredSystems.systemId],
            set: {
              lastVisitedAt: now,
            },
          })
    ).returning();

    await tx
      .update(jumpGates)
      .set(source === 'random_jump'
        ? {
            lastRandomJumpAt: now,
            updatedAt: now,
          }
        : {
            updatedAt: now,
          })
      .where(eq(jumpGates.userId, userId));

    return {
      success: true,
      status: 200,
      ship: {
        id: changedShip.id,
        typeId: changedShip.typeId,
        status: consumeShip ? 'consumed' : changedShip.status,
        fuel: changedShip.fuel,
        locationPlanetId: consumeShip ? null : changedShip.locationPlanetId,
      },
      targetSystem: summarizeTargetSystem(targetSystem),
      targetPlanet,
      arrivalPlanetId: targetPlanet.id,
      destination: serializeDestination(targetSystem, planetCount, knownDestination),
      jumpFuelRequired: JUMP_GATE_JUMP_FUEL_COST,
    };
  });

  return result;
}

export async function jumpShip(
  userId: string,
  req: JumpRequest,
  options: JumpShipOptions = {},
): Promise<JumpResult> {
  const database = options.database ?? defaultDb;
  const now = options.now ?? new Date();

  if (req.targetSector) {
    return {
      success: false,
      status: 400,
      error: 'Choose random jump or a known Jump Gate destination.',
    };
  }

  const shipContext = await loadShipContext(userId, req.shipId, database);
  if ('error' in shipContext) return shipContext.error;

  const gateState = await getJumpGateState(userId, { now, database });
  if (!gateState.unlocked) {
    return {
      success: false,
      status: 400,
      error: gateState.lockedReason?.code === 'jump_drive_required'
        ? 'Jump Drive research level 1 required'
        : 'Jump Gate is locked',
    };
  }

  if (gateState.calibration.status === 'calibrating') {
    return {
      success: false,
      status: 400,
      error: 'Jump Gate calibration is still in progress',
    };
  }

  let targetSystem: typeof systems.$inferSelect | null = null;
  let source: 'random_jump' | 'known_destination' = 'random_jump';

  if (req.destinationSystemId) {
    source = 'known_destination';
    const resolvedKnownSystem = await resolveKnownTargetSystem(
      userId,
      req.destinationSystemId,
      database,
    );
    if ('success' in resolvedKnownSystem) return resolvedKnownSystem;
    targetSystem = resolvedKnownSystem;
  } else {
    if (shipContext.shipRow.typeId !== DISCOVERY_PROBE_TYPE_ID) {
      return {
        success: false,
        status: 400,
        error: `${shipLabel(DISCOVERY_PROBE_TYPE_ID, 'en')} is required to open new systems.`,
      };
    }

    if (!gateState.randomJumpAvailability.available) {
      return {
        success: false,
        status: 400,
        error: randomJumpBlockedMessage(gateState.randomJumpAvailability.blockedCode),
      };
    }

    const randomJumpLimit = await loadRandomJumpLimitState(userId, database);
    if (randomJumpLimit.reached) {
      return {
        success: false,
        status: 400,
        error: RANDOM_JUMP_LIMIT_REACHED_MESSAGE,
      };
    }

    targetSystem = await resolveRandomTargetSystem(
      userId,
      req.shipId,
      now,
      database,
      randomJumpLimit.openedCount === 0,
    );

    if (!targetSystem) {
      return {
        success: false,
        status: 500,
        error: 'No public destination systems are available.',
      };
    }
  }

  const targetPlanet = await loadArrivalPlanet(targetSystem.id, database);
  if ('success' in targetPlanet) return targetPlanet;

  return jumpToSystem({
    userId,
    shipRow: shipContext.shipRow,
    targetSystem,
    targetPlanet,
    source,
    consumeShip: source === 'random_jump',
    now,
    database,
  });
}
