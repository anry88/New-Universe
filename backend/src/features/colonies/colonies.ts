import { db } from '../../db/index.js';
import { colonies } from '../../db/schema/colonies.js';
import { planets, systems } from '../../db/schema/world.js';
import { discoveredPlanets } from '../../db/schema/discovery.js';
import { eq, and, count } from 'drizzle-orm';

export class ColonyService {
  /**
   * Checks if a player can colonize a specific planet.
   * Rules:
   * 1. Planet must exist.
   * 2. Planet must be discovered by the player.
   * 3. Planet must not be in a home system (protected).
   * 4. Planet must not already be colonized by anyone.
   * 5. Player must not have reached their colony limit.
   */
  async canColonize(userId: string, planetId: string): Promise<{ allowed: boolean; reason?: string }> {
    // 1. Check if planet exists and get its system info
    const [planetInfo] = await db
      .select({
        id: planets.id,
        systemId: planets.systemId,
        isHome: systems.isHome,
      })
      .from(planets)
      .innerJoin(systems, eq(planets.systemId, systems.id))
      .where(eq(planets.id, planetId))
      .limit(1);

    if (!planetInfo) {
      return { allowed: false, reason: 'Planet not found' };
    }

    // 2. Protect home systems
    if (planetInfo.isHome) {
      return { allowed: false, reason: 'Cannot colonize home systems' };
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
      return { allowed: false, reason: 'Planet not discovered' };
    }

    // 4. Check if already colonized
    const [existing] = await db
      .select()
      .from(colonies)
      .where(eq(colonies.planetId, planetId))
      .limit(1);

    if (existing) {
      return { allowed: false, reason: 'Planet already colonized' };
    }

    // 5. Check user limits
    const [result] = await db
      .select({ value: count() })
      .from(colonies)
      .where(eq(colonies.ownerId, userId));
    
    const colonyCount = result?.value ?? 0;
    const limit = 5; // TODO: make dynamic based on research or premium
    
    if (colonyCount >= limit) {
      return { allowed: false, reason: 'Colony limit reached' };
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
