import { db } from '../../db/index.js';
import { buildings, buildingTypes, planets, planetResources } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { BuildingType, ConstructionStatus } from '@shared/types/buildings.js';

export class BuildingService {
  async getBuildingTypes(): Promise<BuildingType[]> {
    const types = await db.query.buildingTypes.findMany();
    return types as BuildingType[];
  }

  async build(userId: string, planetId: string, typeId: string, slotIndex: number): Promise<ConstructionStatus> {
    return db.transaction(async (tx) => {
      const planet = await tx.query.planets.findFirst({
        where: eq(planets.id, planetId),
        with: {
          system: true,
          buildings: true,
        }
      });

      if (!planet || (planet.system as any).ownerId !== userId) {
        throw new Error('Planet not found or not owned by user');
      }

      if (slotIndex < 0 || slotIndex >= planet.slotCount) {
        throw new Error('Invalid slot index');
      }

      const existingAtSlot = planet.buildings?.find((b: any) => b.slotIndex === slotIndex);
      if (existingAtSlot) {
        throw new Error('Slot already occupied');
      }

      const typeInfo = await tx.query.buildingTypes.findFirst({
        where: eq(buildingTypes.id, typeId),
      });

      if (!typeInfo) {
        throw new Error('Building type not found');
      }

      const costs = typeInfo.baseCost as Record<string, number>;
      for (const [resId, amount] of Object.entries(costs)) {
        const res = await tx.query.planetResources.findFirst({
          where: and(
            eq(planetResources.planetId, planetId),
            eq(planetResources.resourceId, resId)
          ),
        });

        const resAmount = Math.floor(parseFloat(res?.amount || '0'));
        if (!res || resAmount < amount) {
          throw new Error(`Insufficient resource: ${resId}`);
        }

        await tx.update(planetResources)
          .set({ amount: (resAmount - amount).toString() })
          .where(and(
            eq(planetResources.planetId, planetId),
            eq(planetResources.resourceId, resId)
          ));
      }

      const completesAt = new Date(Date.now() + typeInfo.baseTimeSec * 1000);
      const [newBuilding] = await tx.insert(buildings).values({
        planetId,
        typeId,
        level: 1,
        slotIndex,
        queueAction: 'build',
        queueCompletesAt: completesAt,
      }).returning();

      return {
        success: true,
        queueItem: {
          id: newBuilding.id,
          completesAt: completesAt.toISOString(),
        }
      };
    });
  }

  async upgrade(userId: string, buildingId: string): Promise<ConstructionStatus> {
    return db.transaction(async (tx) => {
      const building = await tx.query.buildings.findFirst({
        where: eq(buildings.id, buildingId),
        with: {
          planet: {
            with: {
              system: true
            }
          }
        }
      });

      if (!building || (building.planet as any).system.ownerId !== userId) {
        throw new Error('Building not found or not owned by user');
      }

      if (building.queueAction) {
        throw new Error('Building already in queue');
      }

      const typeInfo = await tx.query.buildingTypes.findFirst({
        where: eq(buildingTypes.id, building.typeId),
      });

      if (!typeInfo) {
        throw new Error('Building type not found');
      }

      if (building.level >= typeInfo.maxLevel) {
        throw new Error('Maximum level reached');
      }

      const costs = typeInfo.baseCost as Record<string, number>;
      
      for (const [resId, amount] of Object.entries(costs)) {
        const upgradeCost = Math.floor(amount * Math.pow(2, building.level));
        const res = await tx.query.planetResources.findFirst({
          where: and(
            eq(planetResources.planetId, building.planetId),
            eq(planetResources.resourceId, resId)
          ),
        });

        const resAmount = Math.floor(parseFloat(res?.amount || '0'));
        if (!res || resAmount < upgradeCost) {
          throw new Error(`Insufficient resource: ${resId}`);
        }

        await tx.update(planetResources)
          .set({ amount: (resAmount - upgradeCost).toString() })
          .where(and(
            eq(planetResources.planetId, building.planetId),
            eq(planetResources.resourceId, resId)
          ));
      }

      const buildTime = Math.floor(typeInfo.baseTimeSec * Math.pow(2, building.level));
      const completesAt = new Date(Date.now() + buildTime * 1000);

      await tx.update(buildings)
        .set({
          queueAction: 'upgrade',
          queueCompletesAt: completesAt,
        })
        .where(eq(buildings.id, buildingId));

      return {
        success: true,
        queueItem: {
          id: buildingId,
          completesAt: completesAt.toISOString(),
        }
      };
    });
  }
}

export const buildingService = new BuildingService();
