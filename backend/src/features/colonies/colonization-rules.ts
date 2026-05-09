import { db } from '../../db/index.js';
import { colonies } from '../../db/schema/colonies.js';
import { planets, systems } from '../../db/schema/world.js';
import { researchProgress } from '../../db/schema/research.js';
import { eq, and, count, desc } from 'drizzle-orm';
import { COLONIZATION_RULES } from '../../config/colonization-rules.js';

/**
 * Validation result for colonization gates.
 */
export interface ColonizationEligibility {
  allowed: boolean;
  reason?: string;
  details?: {
    currentColonies: number;
    maxColonies: number;
    cooldownRemainingSec: number;
    requiredResearch: { branch: string; level: number };
    currentResearch: number;
    distance?: number;
  };
}

/**
 * Checks if a player satisfies all colonization gates.
 */
export async function checkColonizationGates(userId: string, targetPlanetId: string): Promise<ColonizationEligibility> {
  // 0. Check if planet is already colonized
  const existingColony = await db.query.colonies.findFirst({
    where: eq(colonies.planetId, targetPlanetId),
  });

  if (existingColony) {
    return {
      allowed: false,
      reason: 'Planet already colonized',
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
      details,
    };
  }

  // 2. Colony Limit Gate
  const [result] = await db
    .select({ value: count() })
    .from(colonies)
    .where(eq(colonies.ownerId, userId));
  
  const currentColonies = Number(result?.value ?? 0);
  const maxColonies = COLONIZATION_RULES.maxColoniesBase + (logisticsLevel * COLONIZATION_RULES.maxColoniesPerLogisticsLevel);

  details.currentColonies = currentColonies;
  details.maxColonies = maxColonies;

  if (currentColonies >= maxColonies) {
    return {
      allowed: false,
      reason: `Colony limit reached (${currentColonies}/${maxColonies})`,
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
        details,
      };
    }
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
    return { allowed: false, reason: 'Target planet not found', details };
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
      details,
    };
  }

  return {
    allowed: true,
    details,
  };
}
