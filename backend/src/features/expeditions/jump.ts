import type {
  JumpGateJumpResponse,
  JumpGateKnownDestinationSummary,
} from '@shared/types/jump-gate.js';
import {
  JUMP_FUEL_RESOURCE_ID,
  JUMP_GATE_JUMP_FUEL_COST,
} from '@shared/config/expeditionRouting.js';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db as defaultDb } from '../../db/index.js';
import {
  discoveredSystems,
  jumpGates,
  planets,
  planetResources,
  ships,
  systems,
} from '../../db/schema.js';
import { getJumpGateState } from '../jump-gate/service.js';
import { getOrCreateSector } from '../world/sectors.js';
import { generateSystemsInSector } from '../world/sector-generator.js';
import { spendResources } from '../resources/transactions.js';

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

export interface RandomJumpSectorContext {
  userId: string;
  shipId: string;
  originSystem: typeof systems.$inferSelect;
  now: Date;
}

export interface JumpShipOptions {
  now?: Date;
  database?: typeof defaultDb;
  selectRandomSector?: (
    attempt: number,
    context: RandomJumpSectorContext,
  ) => { x: number; y: number; z: number };
}

type LoadedShipContext = {
  shipRow: typeof ships.$inferSelect;
  originSystem: typeof systems.$inferSelect;
};

type LoadShipContextResult = LoadedShipContext | { error: JumpResult };

const RANDOM_JUMP_ATTEMPTS = 8;
const RANDOM_JUMP_SECTOR_RANGE = 8;

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

function randomOffset(seed: string, axis: string): number {
  const span = RANDOM_JUMP_SECTOR_RANGE * 2 + 1;
  return positiveModulo(hashString(`${seed}:${axis}`), span) - RANDOM_JUMP_SECTOR_RANGE;
}

function defaultRandomSector(
  attempt: number,
  context: RandomJumpSectorContext,
): { x: number; y: number; z: number } {
  const seed = `${context.userId}:${context.shipId}:${context.now.toISOString()}:${attempt}`;
  const offset = {
    x: randomOffset(seed, 'x'),
    y: randomOffset(seed, 'y'),
    z: randomOffset(seed, 'z'),
  };

  if (offset.x === 0 && offset.y === 0 && offset.z === 0) {
    offset.x = 1;
  }

  return {
    x: context.originSystem.sectorX + offset.x,
    y: context.originSystem.sectorY + offset.y,
    z: context.originSystem.sectorZ + offset.z,
  };
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
  return {
    id: system.id,
    name: system.name,
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
  return {
    systemId: system.id,
    systemName: system.name,
    sector: {
      x: system.sectorX,
      y: system.sectorY,
      z: system.sectorZ,
    },
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
    return { error: { success: false, status: 404, error: 'Ship not found' } as JumpResult };
  }

  if (shipRow.typeId !== 'jump_ship') {
    return {
      error: {
        success: false,
        status: 400,
        error: 'Only Jump Ships can perform jumps',
      } as JumpResult,
    };
  }

  if (shipRow.status !== 'idle') {
    return {
      error: {
        success: false,
        status: 400,
        error: 'Ship must be idle to jump',
      } as JumpResult,
    };
  }

  if (!shipRow.locationPlanetId) {
    return {
      error: {
        success: false,
        status: 400,
        error: 'Ship must be stationed on a planet to jump',
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
        error: 'Ship origin system is missing',
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
        error: `not enough ${JUMP_FUEL_RESOURCE_ID}`,
      } as JumpResult,
    };
  }

  return { shipRow, originSystem: originPlanet.system };
}

async function resolveRandomTargetSystem(
  userId: string,
  shipId: string,
  originSystem: typeof systems.$inferSelect,
  now: Date,
  database: typeof defaultDb,
  selectRandomSector: NonNullable<JumpShipOptions['selectRandomSector']>,
) {
  const context: RandomJumpSectorContext = {
    userId,
    shipId,
    originSystem,
    now,
  };

  for (let attempt = 0; attempt < RANDOM_JUMP_ATTEMPTS; attempt += 1) {
    const targetSector = selectRandomSector(attempt, context);
    const sector = await getOrCreateSector(
      targetSector.x,
      targetSector.y,
      targetSector.z,
      database,
    );
    const sectorSystems = await generateSystemsInSector(sector, undefined, database);
    const [targetSystem] = sortSystemsForJump(
      sectorSystems,
      `${userId}:${shipId}:${now.toISOString()}:${attempt}`,
    );

    if (targetSystem) {
      return targetSystem;
    }
  }

  return null;
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
      error: 'Known destination not found',
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
      error: 'Known destination is not a public Jump Gate target',
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
      error: 'Target system has no planets',
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
  now: Date;
  database: typeof defaultDb;
}): Promise<JumpResult> {
  const {
    userId,
    shipRow,
    targetSystem,
    targetPlanet,
    source,
    now,
    database,
  } = params;

  const [{ count: planetCount }] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(planets)
    .where(eq(planets.systemId, targetSystem.id));

  const result = await database.transaction(async (tx) => {
    const jumpFuelSpend = await spendResources(
      shipRow.locationPlanetId!,
      [{ resourceId: JUMP_FUEL_RESOURCE_ID, amount: JUMP_GATE_JUMP_FUEL_COST }],
      tx,
    );
    if (!jumpFuelSpend.success) {
      return {
        success: false,
        status: 400,
        error: jumpFuelSpend.error ?? `not enough ${JUMP_FUEL_RESOURCE_ID}`,
      } satisfies JumpResult;
    }

    const [updatedShip] = await tx
      .update(ships)
      .set({
        locationPlanetId: targetPlanet.id,
      })
      .where(and(
        eq(ships.id, shipRow.id),
        eq(ships.ownerId, userId),
        eq(ships.status, 'idle'),
      ))
      .returning();

    if (!updatedShip) {
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
        id: updatedShip.id,
        typeId: updatedShip.typeId,
        status: updatedShip.status,
        fuel: updatedShip.fuel,
        locationPlanetId: updatedShip.locationPlanetId,
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
      error: 'Manual sector jumps are deprecated; use random jump or destinationSystemId',
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
    if (!gateState.randomJumpAvailability.available) {
      return {
        success: false,
        status: 400,
        error: gateState.randomJumpAvailability.blockedCode ?? 'Random jump is unavailable',
      };
    }

    targetSystem = await resolveRandomTargetSystem(
      userId,
      req.shipId,
      shipContext.originSystem,
      now,
      database,
      options.selectRandomSector ?? defaultRandomSector,
    );

    if (!targetSystem) {
      return {
        success: false,
        status: 500,
        error: 'No public systems generated for random jump',
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
    now,
    database,
  });
}
