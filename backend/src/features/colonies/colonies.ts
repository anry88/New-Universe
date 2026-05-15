import { db } from '../../db/index.js';
import { colonies } from '../../db/schema/colonies.js';
import { planets, systems } from '../../db/schema/world.js';
import { discoveredPlanets } from '../../db/schema/discovery.js';
import { buildings } from '../../db/schema/buildings.js';
import { researchProgress } from '../../db/schema/research.js';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { maxColoniesForLogisticsLevel } from '../../config/colonization-rules.js';
import {
  loadExpansionColonies,
  type ColonizationBlockCode,
} from './colonization-rules.js';

export class ColonyService {
  /**
   * Checks if a player can colonize a specific planet.
   * Rules:
   * 1. Planet must exist.
   * 2. Planet must be discovered by the player.
   * 3. Planet must not be in a home system (protected).
   * 4. Planet must not already be colonized by anyone.
   * 5. Player must not have reached their Logistics-scaled colony limit.
   */
  async canColonize(
    userId: string,
    planetId: string,
  ): Promise<{ allowed: boolean; reason?: string; code?: ColonizationBlockCode }> {
    // 1. Check if planet exists and get its system info
    const [planetInfo] = await db
      .select({
      id: planets.id,
      systemId: planets.systemId,
      isHome: systems.isHome,
      systemOwnerId: systems.ownerId,
    })
      .from(planets)
      .innerJoin(systems, eq(planets.systemId, systems.id))
      .where(eq(planets.id, planetId))
      .limit(1);

    if (!planetInfo) {
      return { allowed: false, reason: 'Planet not found', code: 'colony_planet_not_found' };
    }

    // 2. Protect foreign home systems. Own home-system bodies can be
    // settled after scout discovery; discovery alone must not unlock builds.
    if (planetInfo.isHome && planetInfo.systemOwnerId !== userId) {
      return {
        allowed: false,
        reason: 'Cannot colonize protected home systems',
        code: 'colony_protected_home',
      };
    }

    // 3. Check discovery
    const [discovery] = await db
      .select()
      .from(discoveredPlanets)
      .where(
        and(
          eq(discoveredPlanets.userId, userId),
          eq(discoveredPlanets.planetId, planetId)
        )
      )
      .limit(1);

    if (!discovery) {
      return { allowed: false, reason: 'Planet not discovered', code: 'colony_not_discovered' };
    }

    // 4. Block on existing colony / hostile buildings (P3-COM-007).
    const [existing] = await db
      .select()
      .from(colonies)
      .where(eq(colonies.planetId, planetId))
      .limit(1);

    if (existing) {
      if (existing.ownerId === userId) {
        return {
          allowed: false,
          reason: 'Planet already colonized',
          code: 'colony_already_colonized',
        };
      }
      const [aliveBuilding] = await db
        .select({ id: buildings.id })
        .from(buildings)
        .where(
          and(
            eq(buildings.planetId, planetId),
            isNull(buildings.destroyedAt),
            sql`${buildings.hp} > 0`,
          ),
        )
        .limit(1);
      if (aliveBuilding) {
        return {
          allowed: false,
          reason: 'Planet defended by hostile buildings — clear them before colonizing',
          code: 'colony_blocked_hostile_buildings',
        };
      }
      return {
        allowed: false,
        reason: 'Planet already colonized',
        code: 'colony_already_colonized',
      };
    }

    // Defensive: orphaned buildings without a colony row.
    const [orphanBuilding] = await db
      .select({ id: buildings.id })
      .from(buildings)
      .where(
        and(
          eq(buildings.planetId, planetId),
          isNull(buildings.destroyedAt),
          sql`${buildings.hp} > 0`,
        ),
      )
      .limit(1);

    if (orphanBuilding) {
      return {
        allowed: false,
        reason: 'Planet defended by hostile buildings — clear them before colonizing',
        code: 'colony_blocked_hostile_buildings',
      };
    }

    // 5. Check user limits
    const colonyCount = (await loadExpansionColonies(userId)).length;
    const researchRows = await db.query.researchProgress.findMany({
      where: eq(researchProgress.userId, userId),
    });
    const logisticsLevel = researchRows.find((row) => row.branch === 'logistics')?.level ?? 0;
    const limit = maxColoniesForLogisticsLevel(logisticsLevel);
    
    if (colonyCount >= limit) {
      return { allowed: false, reason: 'Colony limit reached', code: 'colony_limit_reached' };
    }

    return { allowed: true };
  }

  /**
   * Found a new colony.
   * This method assumes validation was already performed by canColonize.
   */
  async foundColony(userId: string, planetId: string) {
    const [newColony] = await db
      .insert(colonies)
      .values({
        ownerId: userId,
        planetId: planetId,
      })
      .returning();
    
    return newColony;
  }
}

export const colonyService = new ColonyService();
