import { db as defaultDb } from '../../db/index.js';
import { planets, systems, buildings, buildingTypes, users, resources, planetResources } from '../../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { spendResources, gainResources } from './transactions.js';

export interface ConvertRequest {
  planetId: string;
  from: 'ice' | 'water';
  to: 'ice' | 'water';
  amount: number;
}

export interface ConvertResult {
  success: boolean;
  status: number;
  data?: {
    from: string;
    fromAmount: number;
    to: string;
    toAmount: number;
  };
  error?: string;
}

const VALID_RESOURCES = ['ice', 'water'] as const;
const UNITS_PER_DIAMOND_BY_TIER: Record<number, number> = {
  1: 100,
  2: 40,
  3: 10,
  4: 2,
};

export interface BuyWithDiamondsRequest {
  planetId: string;
  resourceId: string;
  amount: number;
}

export interface BuyWithDiamondsResult {
  success: boolean;
  status: number;
  data?: {
    resourceId: string;
    amount: number;
    diamondsSpent: number;
    diamondsRemaining: number;
    unitsPerDiamond: number;
    tier: number;
  };
  error?: string;
}

export function quoteDiamondPurchase(tier: number, amount: number): { diamonds: number; unitsPerDiamond: number } {
  const unitsPerDiamond = UNITS_PER_DIAMOND_BY_TIER[tier] ?? 1;
  return {
    diamonds: Math.max(1, Math.ceil(amount / unitsPerDiamond)),
    unitsPerDiamond,
  };
}

export async function convertResources(
  userId: string,
  req: ConvertRequest,
): Promise<ConvertResult> {
  const { planetId, from, to, amount } = req;
  const db = defaultDb;

  const planet = await db.query.planets.findFirst({
    where: eq(planets.id, planetId),
  });
  if (!planet) {
    return { success: false, status: 404, error: 'Planet not found' };
  }

  const system = await db.query.systems.findFirst({
    where: eq(systems.id, planet.systemId),
  });
  if (!system || system.ownerId !== userId) {
    return { success: false, status: 403, error: 'Planet does not belong to you' };
  }

  if (!VALID_RESOURCES.includes(from) || !VALID_RESOURCES.includes(to)) {
    return {
      success: false,
      status: 400,
      error: 'Invalid resource. Only ice and water can be converted.',
    };
  }
  if (from === to) {
    return {
      success: false,
      status: 400,
      error: 'from and to must be different resources',
    };
  }
  if (amount <= 0) {
    return { success: false, status: 400, error: 'Amount must be positive' };
  }

  const direction = `${from}->${to}`;
  if (direction !== 'ice->water' && direction !== 'water->ice') {
    return {
      success: false,
      status: 400,
      error: 'Only ice ↔ water conversion is supported',
    };
  }

  const cryoBuilding = await db.query.buildings.findFirst({
    where: and(
      eq(buildings.planetId, planetId),
      eq(buildings.typeId, 'cryo_factory'),
    ),
  });
  if (!cryoBuilding || cryoBuilding.level < 1) {
    return {
      success: false,
      status: 400,
      error: 'Cryogenic Factory required for resource conversion',
    };
  }

  const cryoType = await db.query.buildingTypes.findFirst({
    where: eq(buildingTypes.id, 'cryo_factory'),
  });

  const fromAmount = Math.floor(amount);
  const toAmount = direction === 'water->ice'
    ? Math.floor(amount * 0.95)
    : Math.floor(amount);

  if (toAmount <= 0) {
    return { success: false, status: 400, error: 'Converted amount is too small' };
  }

  const energyCost = cryoType ? (cryoType.energyConsumption as number) : 0;
  if (energyCost > 0) {
    const allBuildingsOnPlanet = await db
      .select({
        typeId: buildings.typeId,
        level: buildings.level,
      })
      .from(buildings)
      .where(eq(buildings.planetId, planetId));

    const typeIds = [...new Set(allBuildingsOnPlanet.map((b) => b.typeId))];
    const typeRows = typeIds.length > 0
      ? await db
          .select()
          .from(buildingTypes)
          .where(sql`${buildingTypes.id} IN (${sql.join(typeIds.map((id) => sql`${id}`), sql`, `)})`)
      : [];

    const typeMap = new Map(typeRows.map((t) => [t.id, t]));

    let totalProduction = 0;
    let totalConsumption = 0;

    for (const b of allBuildingsOnPlanet) {
      const bt = typeMap.get(b.typeId);
      if (!bt) continue;

      const output = bt.baseOutput as Record<string, any> | null;
      const energyOutput = output?.energy ? Number(output.energy) * b.level : 0;

      if (energyOutput > 0) {
        totalProduction += energyOutput;
      } else {
        totalConsumption += (bt.energyConsumption as number) * b.level;
      }
    }

    if (totalProduction < totalConsumption) {
      return {
        success: false,
        status: 400,
        error: `Not enough energy on this planet (available: ${totalProduction - totalConsumption})`,
      };
    }
  }

  const result = await db.transaction(async (tx) => {
    const spendResult = await spendResources(planetId, [
      { resourceId: from, amount: fromAmount },
    ], tx);

    if (!spendResult.success) {
      return { success: false, status: 400, error: spendResult.error } as ConvertResult;
    }

    await gainResources(planetId, [
      { resourceId: to, amount: toAmount },
    ], tx);

    return {
      success: true,
      status: 200,
      data: {
        from,
        fromAmount,
        to,
        toAmount,
      },
    } as ConvertResult;
  });

  return result;
}

export async function buyResourceWithDiamonds(
  userId: string,
  req: BuyWithDiamondsRequest,
): Promise<BuyWithDiamondsResult> {
  const { planetId, resourceId } = req;
  const amount = Math.floor(req.amount);
  const db = defaultDb;

  if (amount <= 0) {
    return { success: false, status: 400, error: 'Amount must be positive' };
  }

  const planet = await db.query.planets.findFirst({
    where: eq(planets.id, planetId),
  });
  if (!planet) {
    return { success: false, status: 404, error: 'Planet not found' };
  }

  const system = await db.query.systems.findFirst({
    where: eq(systems.id, planet.systemId),
  });
  if (!system || system.ownerId !== userId) {
    return { success: false, status: 403, error: 'Planet does not belong to you' };
  }

  const resource = await db.query.resources.findFirst({
    where: eq(resources.id, resourceId),
  });
  if (!resource) {
    return { success: false, status: 400, error: 'Unknown resource' };
  }

  const resourceOnPlanet = await db.query.planetResources.findFirst({
    where: and(
      eq(planetResources.planetId, planetId),
      eq(planetResources.resourceId, resourceId),
    ),
  });
  if (!resourceOnPlanet) {
    return { success: false, status: 400, error: 'Resource is not available on this planet' };
  }

  const { diamonds, unitsPerDiamond } = quoteDiamondPurchase(resource.tier, amount);

  return db.transaction(async (tx) => {
    const diamondRows = await tx
      .update(users)
      .set({ diamonds: sql`${users.diamonds} - ${diamonds}` })
      .where(and(eq(users.id, userId), sql`${users.diamonds} >= ${diamonds}`))
      .returning({ diamonds: users.diamonds });

    if (!diamondRows.length) {
      return {
        success: false,
        status: 400,
        error: 'Not enough diamonds',
      } as BuyWithDiamondsResult;
    }

    await tx
      .update(planetResources)
      .set({
        amount: sql`${planetResources.amount}::numeric + ${amount}`,
        lastUpdateAt: new Date(),
      })
      .where(
        and(
          eq(planetResources.planetId, planetId),
          eq(planetResources.resourceId, resourceId),
        ),
      );

    return {
      success: true,
      status: 200,
      data: {
        resourceId,
        amount,
        diamondsSpent: diamonds,
        diamondsRemaining: diamondRows[0]!.diamonds,
        unitsPerDiamond,
        tier: resource.tier,
      },
    } as BuyWithDiamondsResult;
  });
}
