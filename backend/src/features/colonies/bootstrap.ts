import { db as defaultDb } from '../../db/index.js';
import { richness, planetResources } from '../../db/schema/world.js';
import { COLONY_BOOTSTRAP_CONFIG } from '../../config/colony-bootstrap.js';
import { eq } from 'drizzle-orm';

/**
 * Bootstraps a newly founded colony with initial resources and regen rates.
 * Acceptance criteria:
 * 1. New colony starts with configured minimal resources.
 * 2. Regen rates are initialized based on planet richness.
 * 3. Atomic execution within colonization transaction.
 */
export async function bootstrapColony(planetId: string, tx?: any) {
  const db = tx || defaultDb;

  // 1. Fetch planet richness (procedural generation results)
  const planetRichness = await db
    .select()
    .from(richness)
    .where(eq(richness.planetId, planetId));

  // 2. Resolve bootstrap resource set
  const bootstrapResources = COLONY_BOOTSTRAP_CONFIG.resources;
  
  // We initialize planet_resources for:
  // - Resources present in richness (to enable production)
  // - Resources present in bootstrap config (to give starting stock)
  const allResourceIds = new Set([
    ...planetRichness.map((r: { resourceId: string }) => r.resourceId),
    ...bootstrapResources.map(r => r.resourceId)
  ]);

  for (const resourceId of allResourceIds) {
    const bootstrapData = bootstrapResources.find(r => r.resourceId === resourceId);
    const richnessData = planetRichness.find((r: { resourceId: string; value: number }) => r.resourceId === resourceId);
    
    // Starting stock from config, or 0
    const initialAmount = bootstrapData ? bootstrapData.amount : 0;
    
    // Regen rate = richness * multiplier (defined in config)
    const regenRate = (richnessData ? richnessData.value : 0) * COLONY_BOOTSTRAP_CONFIG.regenRateMultiplier;

    // Use upsert to be idempotent (e.g. if bootstrap is re-run)
    await db.insert(planetResources).values({
      planetId,
      resourceId,
      amount: initialAmount.toString(),
      regenRate: regenRate.toString(),
      lastUpdateAt: new Date(),
    }).onConflictDoUpdate({
      target: [planetResources.planetId, planetResources.resourceId],
      set: {
        amount: initialAmount.toString(),
        regenRate: regenRate.toString(),
        lastUpdateAt: new Date(),
      }
    });
  }
}
