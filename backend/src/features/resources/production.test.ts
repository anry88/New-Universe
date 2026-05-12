import { beforeAll, describe, expect, it } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  buildings,
  planetResources,
  planets,
  productionOrders,
  researchProgress,
  systems,
  users,
} from '../../db/schema.js';
import { seedBuildingTypes } from '../../db/seed/building-types.js';
import { seedResources } from '../../db/seed/resources.js';
import { seedResearchCatalog } from '../../db/seed/research.js';
import { productionService } from './production.js';

describe('production orders', () => {
  beforeAll(async () => {
    await seedResources();
    await seedBuildingTypes();
    await seedResearchCatalog();
  });

  async function createProductionPlanet(buildingTypeId = 'smelter', buildingLevel = 1) {
    const [user] = await db.insert(users).values({
      tgId: BigInt(Math.floor(Math.random() * 1_000_000_000)),
      tgUsername: `production_${Math.random()}`,
      tgFirstName: 'Production',
    }).returning();

    const [system] = await db.insert(systems).values({
      ownerId: user.id,
      isHome: true,
      sectorX: 10,
      sectorY: 10,
      sectorZ: 0,
      x: '0.00',
      y: '0.00',
      z: '0.00',
      name: `Production System ${Math.random()}`,
      seed: Math.floor(Math.random() * 1_000_000),
    }).returning();

    const [planet] = await db.insert(planets).values({
      systemId: system.id,
      biome: 'green',
      size: 12,
      slotCount: 8,
      name: `Production Planet ${Math.random()}`,
    }).returning();

    await db.insert(buildings).values({
      planetId: planet.id,
      typeId: 'command_center',
      level: 5,
      slotIndex: 0,
    });

    const [building] = await db.insert(buildings).values({
      planetId: planet.id,
      typeId: buildingTypeId,
      level: buildingLevel,
      slotIndex: 1,
    }).returning();
    await db.insert(buildings).values({
      planetId: planet.id,
      typeId: 'battery',
      level: 2,
      slotIndex: 2,
    });

    await db.insert(planetResources).values([
      { planetId: planet.id, resourceId: 'iron', amount: '1000', regenRate: '0' },
      { planetId: planet.id, resourceId: 'water', amount: '1000', regenRate: '0' },
      { planetId: planet.id, resourceId: 'silicon', amount: '1000', regenRate: '0' },
      { planetId: planet.id, resourceId: 'copper', amount: '1000', regenRate: '0' },
      { planetId: planet.id, resourceId: 'steel', amount: '1000', regenRate: '0' },
      { planetId: planet.id, resourceId: 'silicon_carbide', amount: '1000', regenRate: '0' },
      { planetId: planet.id, resourceId: 'oil', amount: '1000', regenRate: '0' },
      { planetId: planet.id, resourceId: 'methane', amount: '1000', regenRate: '0' },
      { planetId: planet.id, resourceId: 'sulfur', amount: '1000', regenRate: '0' },
      { planetId: planet.id, resourceId: 'ice', amount: '1000', regenRate: '0' },
      { planetId: planet.id, resourceId: 'fuel', amount: '1000', regenRate: '0' },
      { planetId: planet.id, resourceId: 'electronics', amount: '0', regenRate: '0' },
      { planetId: planet.id, resourceId: 'energy', amount: '500', regenRate: '0' },
    ]);

    return { user, planet, building };
  }

  async function resourceAmount(planetId: string, resourceId: string): Promise<number> {
    const row = await db.query.planetResources.findFirst({
      where: and(eq(planetResources.planetId, planetId), eq(planetResources.resourceId, resourceId)),
    });
    return Number(row?.amount ?? 0);
  }

  it('previews steel from iron and water', async () => {
    const { user, planet, building } = await createProductionPlanet('smelter');

    const preview = await productionService.preview(user.id, {
      planetId: planet.id,
      buildingId: building.id,
      recipeId: 'steel_from_iron_water',
      quantity: 10,
    });

    expect(preview.canStart).toBe(true);
    expect(preview.output).toEqual({ resourceId: 'steel', amount: 10 });
    expect(preview.inputs).toContainEqual({ resourceId: 'iron', amount: 20 });
    expect(preview.inputs).toContainEqual({ resourceId: 'water', amount: 2 });
  });

  it('spends inputs immediately and grants output only after completion', async () => {
    const { user, planet, building } = await createProductionPlanet('smelter');

    const ironBefore = await resourceAmount(planet.id, 'iron');
    const energyBefore = await resourceAmount(planet.id, 'energy');
    const steelBefore = await resourceAmount(planet.id, 'steel');
    const order = await productionService.start(user.id, {
      planetId: planet.id,
      buildingId: building.id,
      recipeId: 'steel_from_iron_water',
      quantity: 5,
    });

    expect(await resourceAmount(planet.id, 'iron')).toBeCloseTo(ironBefore - 10, 4);
    const energyAfterStart = await resourceAmount(planet.id, 'energy');
    expect(energyAfterStart).toBeLessThanOrEqual(energyBefore);
    expect(energyAfterStart).toBeGreaterThan(energyBefore - 1);
    expect(await resourceAmount(planet.id, 'steel')).toBeCloseTo(steelBefore, 4);

    await db
      .update(productionOrders)
      .set({ completesAt: new Date(Date.now() - 1000) })
      .where(eq(productionOrders.id, order.id));

    const completed = await productionService.processDueOrders({ userId: user.id, planetId: planet.id });
    expect(completed).toBe(1);
    expect(await resourceAmount(planet.id, 'steel')).toBeCloseTo(steelBefore + 5, 4);

    const repeated = await productionService.processDueOrders({ userId: user.id, planetId: planet.id });
    expect(repeated).toBe(0);
    expect(await resourceAmount(planet.id, 'steel')).toBeCloseTo(steelBefore + 5, 4);
  });

  it('rejects production when resources are insufficient', async () => {
    const { user, planet, building } = await createProductionPlanet('smelter');

    const preview = await productionService.preview(user.id, {
      planetId: planet.id,
      buildingId: building.id,
      recipeId: 'steel_from_iron_water',
      quantity: 10000,
    });

    expect(preview.canStart).toBe(false);
    expect(preview.blockedReason?.code).toBe('production_insufficient_resources');
  });

  it('applies building level and research modifiers to input requirements', async () => {
    const low = await createProductionPlanet('smelter', 1);
    const high = await createProductionPlanet('smelter', 5);

    await db.insert(researchProgress).values({
      userId: high.user.id,
      branch: 'mining',
      level: 3,
    }).onConflictDoUpdate({
      target: [researchProgress.userId, researchProgress.branch],
      set: { level: 3 },
    });

    const lowPreview = await productionService.preview(low.user.id, {
      planetId: low.planet.id,
      buildingId: low.building.id,
      recipeId: 'steel_from_iron_water',
      quantity: 10,
    });
    const highPreview = await productionService.preview(high.user.id, {
      planetId: high.planet.id,
      buildingId: high.building.id,
      recipeId: 'steel_from_iron_water',
      quantity: 10,
    });

    const lowIron = lowPreview.inputs.find((input) => input.resourceId === 'iron')!.amount;
    const highIron = highPreview.inputs.find((input) => input.resourceId === 'iron')!.amount;
    expect(highIron).toBeLessThan(lowIron);
    expect(highPreview.durationSec).toBeLessThan(lowPreview.durationSec);
  });

  it('supports multi-component electronics and alternate fuel recipes', async () => {
    const electronics = await createProductionPlanet('fabrication_bay');
    const electronicsPreview = await productionService.preview(electronics.user.id, {
      planetId: electronics.planet.id,
      buildingId: electronics.building.id,
      recipeId: 'electronics_standard',
      quantity: 10,
    });
    const electronicsInputIds = electronicsPreview.inputs.map((input) => input.resourceId).sort();
    expect(electronicsInputIds).toEqual([
      'copper',
      'silicon',
      'silicon_carbide',
      'steel',
    ]);
    expect(electronicsPreview.energyPerHour).toBeGreaterThan(0);

    const refinery = await createProductionPlanet('refinery');
    const oilPreview = await productionService.preview(refinery.user.id, {
      planetId: refinery.planet.id,
      buildingId: refinery.building.id,
      recipeId: 'fuel_from_oil',
      quantity: 10,
    });
    const methanePreview = await productionService.preview(refinery.user.id, {
      planetId: refinery.planet.id,
      buildingId: refinery.building.id,
      recipeId: 'fuel_from_methane',
      quantity: 10,
    });
    const oilInput = oilPreview.inputs.find((input) => input.resourceId === 'oil')!.amount;
    const methaneInput = methanePreview.inputs.find((input) => input.resourceId === 'methane')!.amount;
    expect(methaneInput).toBeGreaterThan(oilInput);
  });

  it('blocks process start without available energy and supports fuel-generator charge recipes', async () => {
    const smelter = await createProductionPlanet('smelter');
    await db
      .update(planetResources)
      .set({ amount: '0', regenRate: '0' })
      .where(and(eq(planetResources.planetId, smelter.planet.id), eq(planetResources.resourceId, 'energy')));

    const blocked = await productionService.preview(smelter.user.id, {
      planetId: smelter.planet.id,
      buildingId: smelter.building.id,
      recipeId: 'steel_from_iron_water',
      quantity: 10,
    });
    expect(blocked.canStart).toBe(false);
    expect(blocked.blockedReason?.code).toBe('production_insufficient_energy');
    expect(blocked.blockedReason?.details?.energyPerHour).toBeGreaterThan(0);

    const generator = await createProductionPlanet('fuel_generator');
    await db.insert(researchProgress).values({
      userId: generator.user.id,
      branch: 'energy',
      level: 3,
    }).onConflictDoUpdate({
      target: [researchProgress.userId, researchProgress.branch],
      set: { level: 3 },
    });

    const fuelPreview = await productionService.preview(generator.user.id, {
      planetId: generator.planet.id,
      buildingId: generator.building.id,
      recipeId: 'energy_from_fuel',
      quantity: 1,
    });
    const methanePreview = await productionService.preview(generator.user.id, {
      planetId: generator.planet.id,
      buildingId: generator.building.id,
      recipeId: 'energy_from_methane',
      quantity: 1,
    });

    expect(fuelPreview.canStart).toBe(true);
    expect(fuelPreview.output.amount).toBeCloseTo(90 * 1.18, 4);
    expect(fuelPreview.output.amount).toBeGreaterThan(methanePreview.output.amount);
  });

  it('pauses queued production when energy runs out and resumes after charge returns', async () => {
    const { user, planet, building } = await createProductionPlanet('smelter');
    const order = await productionService.start(user.id, {
      planetId: planet.id,
      buildingId: building.id,
      recipeId: 'steel_from_iron_water',
      quantity: 5,
    });

    await db
      .update(planetResources)
      .set({ amount: '0', regenRate: '0', lastUpdateAt: new Date() })
      .where(and(eq(planetResources.planetId, planet.id), eq(planetResources.resourceId, 'energy')));

    await productionService.processDueOrders({ userId: user.id, planetId: planet.id });
    const paused = await db.query.productionOrders.findFirst({
      where: eq(productionOrders.id, order.id),
    });
    expect(paused?.status).toBe('paused');
    expect(paused?.pausedAt).toBeTruthy();

    await db
      .update(planetResources)
      .set({ amount: '100', regenRate: '0', lastUpdateAt: new Date() })
      .where(and(eq(planetResources.planetId, planet.id), eq(planetResources.resourceId, 'energy')));

    await productionService.processDueOrders({ userId: user.id, planetId: planet.id });
    const resumed = await db.query.productionOrders.findFirst({
      where: eq(productionOrders.id, order.id),
    });
    expect(resumed?.status).toBe('queued');
    expect(resumed?.pausedAt).toBeNull();
    expect(resumed?.completesAt.getTime()).toBeGreaterThan(order.completesAt ? new Date(order.completesAt).getTime() : 0);
  });
});
