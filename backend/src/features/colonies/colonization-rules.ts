import { db } from '../../db/index.js';
import { colonies } from '../../db/schema/colonies.js';
import { planets, systems } from '../../db/schema/world.js';
import { buildings } from '../../db/schema/buildings.js';
import { discoveredPlanets } from '../../db/schema/discovery.js';
import { researchProgress } from '../../db/schema/research.js';
import { eq, and, count, desc, isNull, sql } from 'drizzle-orm';
import {
  COLONIZATION_RULES,
  maxColoniesForLogisticsLevel,
} from '../../config/colonization-rules.js';

/**
 * Typed colonization block codes — stable strings the frontend can switch on
 * to render localized messages without parsing English `reason` strings.
 */
export type ColonizationBlockCode =
  | 'colony_planet_not_found'
  | 'colony_protected_home'
  | 'colony_not_discovered'
  | 'colony_already_colonized'
  | 'colony_blocked_hostile_buildings'
  | 'colony_research_required'
  | 'colony_limit_reached'
  | 'colony_cooldown'
  | 'colony_too_far';

/**
 * Validation result for colonization gates.
 */
export interface ColonizationEligibility {
  allowed: boolean;
  reason?: string;
  code?: ColonizationBlockCode;
  details?: {
    currentColonies: number;
    maxColonies: number;
    cooldownRemainingSec: number;
    requiredResearch: { branch: string; level: number };
    currentResearch: number;
    distance?: number;
  };
}

export interface ColonizationGateOptions {
  enforceDistance?: boolean;
}

/**
 * Checks if a player satisfies all colonization gates.
 */
export async function checkColonizationGates(
  userId: string,
  targetPlanetId: string,
  options: ColonizationGateOptions = {},
): Promise<ColonizationEligibility> {
  const enforceDistance = options.enforceDistance ?? true;
  const [targetPlanetInfo] = await db
    .select({
      systemOwnerId: systems.ownerId,
      isHome: systems.isHome,
    })
    .from(planets)
    .innerJoin(systems, eq(planets.systemId, systems.id))
    .where(eq(planets.id, targetPlanetId))
    .limit(1);

  if (!targetPlanetInfo) {
    return {
      allowed: false,
      reason: 'Target planet not found',
      code: 'colony_planet_not_found',
    };
  }

  if (targetPlanetInfo.isHome && targetPlanetInfo.systemOwnerId !== userId) {
    return {
      allowed: false,
      reason: 'Cannot colonize protected home systems',
      code: 'colony_protected_home',
    };
  }

  const discovery = await db.query.discoveredPlanets.findFirst({
    where: and(
      eq(discoveredPlanets.userId, userId),
      eq(discoveredPlanets.planetId, targetPlanetId),
    ),
  });

  if (!discovery) {
    return {
      allowed: false,
      reason: 'Planet not discovered',
      code: 'colony_not_discovered',
    };
  }

  // 0. Hostile-buildings gate (P3-COM-007): while any defending building is
  // still standing on the target planet, the colonizer cannot land. Bombing
  // (combat tick) clears these one by one; when the Command Center finally
  // dies, the cascade in `tick-combat.ts` wipes the colony and remaining
  // buildings together, so a fresh colonizer can claim the planet.
  const existingColony = await db.query.colonies.findFirst({
    where: eq(colonies.planetId, targetPlanetId),
  });

  if (existingColony) {
    if (existingColony.ownerId === userId) {
      return {
        allowed: false,
        reason: 'Planet already colonized',
        code: 'colony_already_colonized',
      };
    }
    const hasHostileBuilding = await hasAliveBuildingOnPlanet(targetPlanetId);
    if (hasHostileBuilding) {
      return {
        allowed: false,
        reason: 'Planet defended by hostile buildings — clear them before colonizing',
        code: 'colony_blocked_hostile_buildings',
      };
    }
    // Defensive fallback: a foreign colony row with no live buildings should
    // not exist (CC destruction wipes both atomically) but treat it as still
    // colonized rather than silently allowing a takeover.
    return {
      allowed: false,
      reason: 'Planet already colonized',
      code: 'colony_already_colonized',
    };
  }

  // Defensive: there is no colony row, but there might still be an orphaned
  // Command Center or non-CC building from an out-of-band scenario.
  const aliveBuildingExists = await hasAliveBuildingOnPlanet(targetPlanetId);
  if (aliveBuildingExists) {
    return {
      allowed: false,
      reason: 'Planet defended by hostile buildings — clear them before colonizing',
      code: 'colony_blocked_hostile_buildings',
    };
  }

  // 1. Research Gate
  const userResearch = await db.query.researchProgress.findMany({
    where: eq(researchProgress.userId, userId),
  });

  const logisticsLevel = userResearch.find(r => r.branch === 'logistics')?.level || 0;
  const engineeringLevel = userResearch.find(r => r.branch === COLONIZATION_RULES.researchRequirement.branch)?.level || 0;

  const details: ColonizationEligibility['details'] = {
    currentColonies: 0,
    maxColonies: 0,
    cooldownRemainingSec: 0,
    requiredResearch: COLONIZATION_RULES.researchRequirement,
    currentResearch: engineeringLevel,
  };

  if (engineeringLevel < COLONIZATION_RULES.researchRequirement.level) {
    return {
      allowed: false,
      reason: `Requires ${COLONIZATION_RULES.researchRequirement.branch} level ${COLONIZATION_RULES.researchRequirement.level}`,
      code: 'colony_research_required',
      details,
    };
  }

  // 2. Colony Limit Gate
  const [result] = await db
    .select({ value: count() })
    .from(colonies)
    .where(eq(colonies.ownerId, userId));
  
  const currentColonies = Number(result?.value ?? 0);
  const maxColonies = maxColoniesForLogisticsLevel(logisticsLevel);

  details.currentColonies = currentColonies;
  details.maxColonies = maxColonies;

  if (currentColonies >= maxColonies) {
    return {
      allowed: false,
      reason: `Colony limit reached (${currentColonies}/${maxColonies})`,
      code: 'colony_limit_reached',
      details,
    };
  }

  // 3. Cooldown Gate
  const [lastColony] = await db
    .select({ foundedAt: colonies.foundedAt })
    .from(colonies)
    .where(eq(colonies.ownerId, userId))
    .orderBy(desc(colonies.foundedAt))
    .limit(1);

  if (lastColony) {
    const elapsedSec = Math.floor((Date.now() - new Date(lastColony.foundedAt).getTime()) / 1000);
    if (elapsedSec < COLONIZATION_RULES.cooldownSec) {
      details.cooldownRemainingSec = COLONIZATION_RULES.cooldownSec - elapsedSec;
      return {
        allowed: false,
        reason: 'Colonization on cooldown',
        code: 'colony_cooldown',
        details,
      };
    }
  }

  if (!enforceDistance) {
    return {
      allowed: true,
      details,
    };
  }

  // 4. Distance Gate
  const [targetPlanet] = await db
    .select({
      x: systems.x,
      y: systems.y,
      z: systems.z,
    })
    .from(planets)
    .innerJoin(systems, eq(planets.systemId, systems.id))
    .where(eq(planets.id, targetPlanetId))
    .limit(1);

  if (!targetPlanet) {
    return {
      allowed: false,
      reason: 'Target planet not found',
      code: 'colony_planet_not_found',
      details,
    };
  }

  const ownedColonies = await db
    .select({
      x: systems.x,
      y: systems.y,
      z: systems.z,
    })
    .from(colonies)
    .innerJoin(planets, eq(colonies.planetId, planets.id))
    .innerJoin(systems, eq(planets.systemId, systems.id))
    .where(eq(colonies.ownerId, userId));

  const homeSystems = await db
    .select({
      x: systems.x,
      y: systems.y,
      z: systems.z,
    })
    .from(systems)
    .where(and(eq(systems.ownerId, userId), eq(systems.isHome, true)));

  const allOwnedPositions = [...ownedColonies, ...homeSystems];
  
  const tx = Number(targetPlanet.x);
  const ty = Number(targetPlanet.y);
  const tz = Number(targetPlanet.z);

  let minDistance = Infinity;
  for (const pos of allOwnedPositions) {
    const dx = Number(pos.x) - tx;
    const dy = Number(pos.y) - ty;
    const dz = Number(pos.z) - tz;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < minDistance) minDistance = dist;
  }

  details.distance = minDistance === Infinity ? undefined : Math.round(minDistance);

  if (minDistance > COLONIZATION_RULES.maxDistance) {
    return {
      allowed: false,
      reason: `Target is too far from nearest colony (Distance: ${Math.round(minDistance)}, Max: ${COLONIZATION_RULES.maxDistance})`,
      code: 'colony_too_far',
      details,
    };
  }

  return {
    allowed: true,
    details,
  };
}

/**
 * Returns true when the given planet still has at least one defending
 * building — i.e. an entry in `buildings` with `destroyed_at IS NULL`
 * and HP above zero. Used by the colonization gate (P3-COM-007) to block
 * settlement until orbital bombing finishes the planet off.
 */
async function hasAliveBuildingOnPlanet(planetId: string): Promise<boolean> {
  const row = await db.query.buildings.findFirst({
    where: and(
      eq(buildings.planetId, planetId),
      isNull(buildings.destroyedAt),
      sql`${buildings.hp} > 0`,
    ),
    columns: { id: true },
  });
  return !!row;
}
