import { and, desc, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import { systemMapOrbitRadiusForSlot } from '@shared/format/systemMapLayout.js';
import {
  formatCommonSystemDisplayName,
  homeSystemShortTag,
} from '@shared/format/homeSystemNaming.js';
import type {
  JumpGateAnchor,
  JumpGateCalibrationState,
  JumpGateDestinationPlanetSummary,
  JumpGateKnownDestinationSummary,
  JumpGateLockedReason,
  JumpGateRandomJumpAvailability,
  JumpGateStateResponse,
} from '@shared/types/jump-gate.js';
import { JUMP_DRIVE_RESEARCH_GATE } from '../../config/research-unlocks.js';
import { db as defaultDb } from '../../db/index.js';
import {
  buildings,
  colonies,
  discoveredPlanets,
  discoveredSystems,
  jumpGates,
  planets,
  planetResources,
  resources as resourceDefinitions,
  richness,
  systems,
} from '../../db/schema.js';
import { loadUserResearchLevels, meetsResearchRequirement } from '../research/gates.js';

const HOME_GATE_ORBIT_SLOT = 10;
const KNOWN_DESTINATION_LIMIT = 10;

type JumpGateDatabase = typeof defaultDb;
type JumpGateTransaction = Parameters<Parameters<JumpGateDatabase['transaction']>[0]>[0];
type JumpGateDataSource = JumpGateDatabase | JumpGateTransaction;

interface GetJumpGateStateOptions {
  now?: Date;
  knownDestinationLimit?: number;
  database?: JumpGateDataSource;
}

function serializeDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

function buildLockedCalibrationState(): JumpGateCalibrationState {
  return {
    status: 'locked',
    mode: null,
    targetSystemId: null,
    startedAt: null,
    completesAt: null,
  };
}

function buildAnchor(homeSystem: typeof systems.$inferSelect | undefined): JumpGateAnchor | null {
  if (!homeSystem) return null;

  const orbitRadius = systemMapOrbitRadiusForSlot(HOME_GATE_ORBIT_SLOT);
  return {
    systemId: homeSystem.id,
    systemName: homeSystem.name,
    sector: {
      x: homeSystem.sectorX,
      y: homeSystem.sectorY,
      z: homeSystem.sectorZ,
    },
    orbitSlot: HOME_GATE_ORBIT_SLOT,
    orbitRadius,
    position: {
      x: orbitRadius,
      y: 0,
      z: 0,
    },
  };
}

function calibrationFromGate(gate: typeof jumpGates.$inferSelect): JumpGateCalibrationState {
  return {
    status: gate.calibrationStatus,
    mode: gate.calibrationMode ?? null,
    targetSystemId: gate.calibrationTargetSystemId ?? null,
    startedAt: serializeDate(gate.calibrationStartedAt),
    completesAt: serializeDate(gate.calibrationCompletesAt),
  };
}

function randomJumpAvailability(
  unlocked: boolean,
  lockedReason: JumpGateLockedReason | null,
  calibration: JumpGateCalibrationState,
  randomJumpReadyAt: Date | null | undefined,
  now: Date,
): JumpGateRandomJumpAvailability {
  if (!unlocked) {
    return {
      available: false,
      blockedCode: lockedReason?.code ?? 'jump_drive_required',
      readyAt: null,
    };
  }

  if (calibration.status === 'calibrating') {
    return {
      available: false,
      blockedCode: 'calibration_in_progress',
      readyAt: calibration.completesAt,
    };
  }

  if (randomJumpReadyAt && randomJumpReadyAt.getTime() > now.getTime()) {
    return {
      available: false,
      blockedCode: 'random_jump_cooldown',
      readyAt: randomJumpReadyAt.toISOString(),
    };
  }

  return {
    available: true,
    blockedCode: null,
    readyAt: null,
  };
}

async function ensureGateRow(
  userId: string,
  homeSystemId: string,
  database: JumpGateDataSource,
): Promise<typeof jumpGates.$inferSelect> {
  const now = new Date();
  const [gate] = await database
    .insert(jumpGates)
    .values({
      userId,
      homeSystemId,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: jumpGates.userId,
      set: {
        homeSystemId,
        updatedAt: now,
      },
    })
    .returning();

  if (!gate) {
    throw new Error('Failed to resolve Jump Gate row');
  }

  return gate;
}

async function finalizeDueCalibration(
  gate: typeof jumpGates.$inferSelect,
  now: Date,
  database: JumpGateDataSource,
): Promise<typeof jumpGates.$inferSelect> {
  if (
    gate.calibrationStatus !== 'calibrating' ||
    !gate.calibrationCompletesAt ||
    gate.calibrationCompletesAt.getTime() > now.getTime()
  ) {
    return gate;
  }

  const [updated] = await database
    .update(jumpGates)
    .set({
      calibrationStatus: 'ready',
      updatedAt: now,
    })
    .where(eq(jumpGates.id, gate.id))
    .returning();

  return updated ?? gate;
}

async function loadKnownDestinations(
  userId: string,
  database: JumpGateDataSource,
  limit: number,
): Promise<JumpGateKnownDestinationSummary[]> {
  const rows = await database
    .select({
      systemId: systems.id,
      systemName: systems.name,
      sectorX: systems.sectorX,
      sectorY: systems.sectorY,
      sectorZ: systems.sectorZ,
      seed: systems.seed,
      discoveredAt: discoveredSystems.discoveredAt,
      source: discoveredSystems.source,
      lastVisitedAt: discoveredSystems.lastVisitedAt,
      planetCount: sql<number>`count(${planets.id})::int`,
    })
    .from(discoveredSystems)
    .innerJoin(systems, eq(discoveredSystems.systemId, systems.id))
    .leftJoin(planets, eq(planets.systemId, systems.id))
    .where(and(
      eq(discoveredSystems.userId, userId),
      eq(systems.isHome, false),
      isNull(systems.ownerId),
    ))
    .groupBy(
      systems.id,
      systems.name,
      systems.sectorX,
      systems.sectorY,
      systems.sectorZ,
      systems.seed,
      discoveredSystems.discoveredAt,
      discoveredSystems.source,
      discoveredSystems.lastVisitedAt,
    )
    .orderBy(desc(sql`coalesce(${discoveredSystems.lastVisitedAt}, ${discoveredSystems.discoveredAt})`))
    .limit(limit);

  const systemIds = rows.map((row) => row.systemId);
  const planetSummaries = await loadKnownDestinationPlanets(userId, systemIds, database);

  return rows.map((row) => ({
    systemId: row.systemId,
    systemName: formatCommonSystemDisplayName('en', homeSystemShortTag(row.systemId)),
    shortTag: homeSystemShortTag(row.systemId),
    sector: {
      x: row.sectorX,
      y: row.sectorY,
      z: row.sectorZ,
    },
    seed: row.seed,
    planetCount: Number(row.planetCount),
    planets: planetSummaries.get(row.systemId) ?? [],
    discoveredAt: row.discoveredAt.toISOString(),
    source: row.source,
    lastVisitedAt: serializeDate(row.lastVisitedAt),
  }));
}

async function loadKnownDestinationPlanets(
  userId: string,
  systemIds: string[],
  database: JumpGateDataSource,
): Promise<Map<string, JumpGateDestinationPlanetSummary[]>> {
  if (systemIds.length === 0) return new Map();

  const planetRows = await database
    .select({
      id: planets.id,
      systemId: planets.systemId,
      name: planets.name,
      biome: planets.biome,
      size: planets.size,
      slotCount: planets.slotCount,
    })
    .from(planets)
    .where(inArray(planets.systemId, systemIds))
    .orderBy(planets.systemId, planets.name, planets.id);

  const planetIds = planetRows.map((planet) => planet.id);
  if (planetIds.length === 0) return new Map();

  const [
    discoveryRows,
    colonyRows,
    resourceRows,
    richnessRows,
    buildingRows,
  ] = await Promise.all([
    database
      .select({ planetId: discoveredPlanets.planetId })
      .from(discoveredPlanets)
      .where(
        and(
          eq(discoveredPlanets.userId, userId),
          inArray(discoveredPlanets.planetId, planetIds),
        ),
      ),
    database
      .select({
        planetId: colonies.planetId,
        ownerId: colonies.ownerId,
      })
      .from(colonies)
      .where(inArray(colonies.planetId, planetIds)),
    database
      .select({
        planetId: planetResources.planetId,
        resourceId: planetResources.resourceId,
        amount: planetResources.amount,
        regenRate: planetResources.regenRate,
        lastUpdateAt: planetResources.lastUpdateAt,
        storageCap: resourceDefinitions.defaultStorageCap,
      })
      .from(planetResources)
      .innerJoin(
        resourceDefinitions,
        eq(resourceDefinitions.id, planetResources.resourceId),
      )
      .where(inArray(planetResources.planetId, planetIds)),
    database
      .select({
        planetId: richness.planetId,
        resourceId: richness.resourceId,
        value: richness.value,
      })
      .from(richness)
      .where(inArray(richness.planetId, planetIds)),
    database
      .select({
        planetId: buildings.planetId,
        buildingCount: sql<number>`count(*)::int`,
        lastCombatTickAt: sql<Date | null>`max(${buildings.lastCombatTickAt})`,
      })
      .from(buildings)
      .where(
        and(
          inArray(buildings.planetId, planetIds),
          isNull(buildings.destroyedAt),
          gt(buildings.hp, 0),
        ),
      )
      .groupBy(buildings.planetId),
  ]);

  const discoveredPlanetIds = new Set(discoveryRows.map((row) => row.planetId));
  const colonyByPlanetId = new Map(
    colonyRows.map((row) => [row.planetId, row.ownerId]),
  );
  const richnessByPlanetResource = new Map(
    richnessRows.map((row) => [`${row.planetId}:${row.resourceId}`, row.value]),
  );
  const resourcesByPlanetId = new Map<
    string,
    NonNullable<JumpGateDestinationPlanetSummary['resources']>
  >();
  const buildingStateByPlanetId = new Map(
    buildingRows.map((row) => [
      row.planetId,
      {
        buildingCount: Number(row.buildingCount),
        lastCombatTickAt: serializeDate(row.lastCombatTickAt),
      },
    ]),
  );
  for (const row of resourceRows) {
    const planetRows = resourcesByPlanetId.get(row.planetId) ?? [];
    planetRows.push({
      planetId: row.planetId,
      resourceId: row.resourceId,
      amount: row.amount.toString(),
      lastUpdateAt: row.lastUpdateAt.toISOString(),
      regenRate: row.regenRate.toString(),
      richness:
        richnessByPlanetResource.get(`${row.planetId}:${row.resourceId}`) ?? 0,
      storageCap: row.storageCap.toString(),
    });
    resourcesByPlanetId.set(row.planetId, planetRows);
  }
  const orbitIndexBySystemId = new Map<string, number>();
  const summaries = new Map<string, JumpGateDestinationPlanetSummary[]>();

  for (const planet of planetRows) {
    const orbitIndex = (orbitIndexBySystemId.get(planet.systemId) ?? 0) + 1;
    orbitIndexBySystemId.set(planet.systemId, orbitIndex);

    const isDiscovered = discoveredPlanetIds.has(planet.id);
    const colonyOwnerId = colonyByPlanetId.get(planet.id);
    const buildingState = buildingStateByPlanetId.get(planet.id);
    // Active colonies are intentionally visible to other players in opened
    // public systems so hostile holdings can be recognized, surveyed, bombed,
    // and only then colonized.
    const isVisible = isDiscovered || Boolean(colonyOwnerId);
    const systemSummaries = summaries.get(planet.systemId) ?? [];
    systemSummaries.push({
      id: planet.id,
      systemId: planet.systemId,
      orbitIndex,
      name: isVisible ? planet.name : null,
      biome: isVisible ? planet.biome : null,
      size: isVisible ? planet.size : null,
      slotCount: isVisible ? planet.slotCount : null,
      resources: isVisible
        ? (resourcesByPlanetId.get(planet.id) ?? [])
        : undefined,
      isDiscovered: isVisible,
      isColonized: Boolean(colonyOwnerId),
      isOwnedColony: colonyOwnerId === userId,
      buildingCount: isVisible ? (buildingState?.buildingCount ?? 0) : undefined,
      lastCombatTickAt: isVisible
        ? (buildingState?.lastCombatTickAt ?? null)
        : undefined,
    });
    summaries.set(planet.systemId, systemSummaries);
  }

  return summaries;
}

export async function getJumpGateState(
  userId: string,
  options: GetJumpGateStateOptions = {},
): Promise<JumpGateStateResponse> {
  const database = options.database ?? defaultDb;
  const now = options.now ?? new Date();
  const knownDestinationLimit = options.knownDestinationLimit ?? KNOWN_DESTINATION_LIMIT;

  const [homeSystem, researchLevels] = await Promise.all([
    database.query.systems.findFirst({
      where: and(eq(systems.ownerId, userId), eq(systems.isHome, true)),
    }),
    loadUserResearchLevels(userId, database),
  ]);

  const currentJumpDriveLevel = researchLevels.get(JUMP_DRIVE_RESEARCH_GATE.branch) ?? 0;
  const hasHomeSystem = Boolean(homeSystem);
  const unlocked = hasHomeSystem && meetsResearchRequirement(researchLevels, JUMP_DRIVE_RESEARCH_GATE);

  const lockedReason: JumpGateLockedReason | null = unlocked
    ? null
    : hasHomeSystem
      ? {
          code: 'jump_drive_required',
          requiredResearch: JUMP_DRIVE_RESEARCH_GATE,
          currentResearchLevel: currentJumpDriveLevel,
        }
      : { code: 'home_system_missing' };

  const homeGateAnchor = buildAnchor(homeSystem);
  const knownDestinations = await loadKnownDestinations(userId, database, knownDestinationLimit);

  if (!unlocked || !homeSystem) {
    const calibration = buildLockedCalibrationState();
    return {
      unlocked: false,
      lockedReason,
      homeGateAnchor,
      calibration,
      randomJumpAvailability: randomJumpAvailability(false, lockedReason, calibration, null, now),
      knownDestinations,
    };
  }

  const gate = await finalizeDueCalibration(
    await ensureGateRow(userId, homeSystem.id, database),
    now,
    database,
  );
  const calibration = calibrationFromGate(gate);

  return {
    unlocked: true,
    lockedReason: null,
    homeGateAnchor,
    calibration,
    randomJumpAvailability: randomJumpAvailability(
      true,
      null,
      calibration,
      gate.randomJumpReadyAt,
      now,
    ),
    knownDestinations,
  };
}
