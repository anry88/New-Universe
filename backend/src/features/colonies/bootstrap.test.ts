import { describe, expect, it, beforeAll } from 'vitest';
import { db } from '../../db/index.js';
import { bootstrapColony } from './bootstrap.js';
import { richness, planetResources, planets, systems } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { COLONY_BOOTSTRAP_CONFIG } from '../../config/colony-bootstrap.js';

describe('bootstrapColony', () => {
  let targetPlanetId: string;

  beforeAll(async () => {
    // Setup system and planet
    const [system] = await db.insert(systems).values({
      isHome: false,
      sectorX: Math.floor(Math.random() * 1000),
      sectorY: Math.floor(Math.random() * 1000),
      sectorZ: Math.floor(Math.random() * 1000),
      x: '0.00',
      y: '0.00',
      z: '0.00',
      name: 'Bootstrap Test System',
      seed: 999,
    }).returning();

    const [planet] = await db.insert(planets).values({
      systemId: system.id,
      biome: 'rocky',
      size: 10,
      slotCount: 8,
      name: 'Bootstrap Planet',
    }).returning();
    targetPlanetId = planet.id;

    // Setup richness (e.g. Iron 2, Silicon 1)
    await db.insert(richness).values([
      { planetId: targetPlanetId, resourceId: 'iron', value: 2 },
      { planetId: targetPlanetId, resourceId: 'silicon', value: 1 },
    ]);
  });

  it('correctly initializes resources and regen rates', async () => {
    await bootstrapColony(targetPlanetId);

    const resources = await db
      .select()
      .from(planetResources)
      .where(eq(planetResources.planetId, targetPlanetId));

    // Iron should have amount from config and regen = 2 * multiplier
    const iron = resources.find(r => r.resourceId === 'iron');
    const ironBootstrap = COLONY_BOOTSTRAP_CONFIG.resources.find(r => r.resourceId === 'iron');
    expect(iron).toBeDefined();
    expect(Number(iron!.amount)).toBe(ironBootstrap!.amount);
    expect(Number(iron!.regenRate)).toBe(2 * COLONY_BOOTSTRAP_CONFIG.regenRateMultiplier);

    // Silicon should have amount from config and regen = 1 * multiplier
    const silicon = resources.find(r => r.resourceId === 'silicon');
    const siliconBootstrap = COLONY_BOOTSTRAP_CONFIG.resources.find(r => r.resourceId === 'silicon');
    expect(silicon).toBeDefined();
    expect(Number(silicon!.amount)).toBe(siliconBootstrap!.amount);
    expect(Number(silicon!.regenRate)).toBe(1 * COLONY_BOOTSTRAP_CONFIG.regenRateMultiplier);

    // Fuel should have amount from config and regen = 0 (missing in richness)
    const fuel = resources.find(r => r.resourceId === 'fuel');
    const fuelBootstrap = COLONY_BOOTSTRAP_CONFIG.resources.find(r => r.resourceId === 'fuel');
    expect(fuel).toBeDefined();
    expect(Number(fuel!.amount)).toBe(fuelBootstrap!.amount);
    expect(Number(fuel!.regenRate)).toBe(0);
  });

  it('is idempotent on multiple runs', async () => {
    // Run again
    await bootstrapColony(targetPlanetId);
    
    const resources = await db
      .select()
      .from(planetResources)
      .where(eq(planetResources.planetId, targetPlanetId));
    
    // Should still have the same resources
    expect(resources.length).toBeGreaterThanOrEqual(COLONY_BOOTSTRAP_CONFIG.resources.length);
  });
});
