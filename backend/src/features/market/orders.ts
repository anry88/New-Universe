import { and, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { marketOrders, planetResources, planets, resources, systems } from '../../db/schema.js';
import { spendResources, gainResources } from '../resources/transactions.js';
import { calculateNpcMarketQuote } from './pricing.js';
import { canTransitionMarketOrderStatus } from './types.js';

export interface MarketOfferView {
  resourceId: string;
  tier: number;
  side: 'buy' | 'sell';
  pricePerUnit: number;
  availableQty: number;
  modelVersion: string;
}

export interface CreateNpcOrderInput {
  userId: string;
  planetId: string;
  side: 'buy' | 'sell';
  resourceId: string;
  quantity: number;
  expectedUnitPrice: number;
}

export interface CancelNpcOrderInput {
  userId: string;
  orderId: string;
  planetId: string;
}

function marketDepthByTier(tier: number): number {
  switch (tier) {
    case 1:
      return 20_000;
    case 2:
      return 8_000;
    case 3:
      return 2_000;
    default:
      return 600;
  }
}

async function assertPlanetOwnership(userId: string, planetId: string): Promise<void> {
  const planet = await db.query.planets.findFirst({
    where: eq(planets.id, planetId),
    columns: { id: true, systemId: true },
  });
  if (!planet) throw new Error('Planet not found');

  const system = await db.query.systems.findFirst({
    where: eq(systems.id, planet.systemId),
    columns: { ownerId: true },
  });
  if (!system || system.ownerId !== userId) {
    throw new Error('Planet not owned by user');
  }
}

export async function listNpcMarketOffers(): Promise<{ offers: MarketOfferView[] }> {
  const allResources = await db.query.resources.findMany({
    columns: { id: true, tier: true, defaultStorageCap: true },
  });

  const offers: MarketOfferView[] = [];
  for (const resource of allResources) {
    const stockRatio = 1;
    const quote = calculateNpcMarketQuote({
      resourceId: resource.id,
      tier: resource.tier,
      stockRatio,
    });
    const depth = marketDepthByTier(resource.tier);
    offers.push({
      resourceId: resource.id,
      tier: resource.tier,
      side: 'buy',
      pricePerUnit: quote.buyPrice,
      availableQty: depth,
      modelVersion: quote.modelVersion,
    });
    offers.push({
      resourceId: resource.id,
      tier: resource.tier,
      side: 'sell',
      pricePerUnit: quote.sellPrice,
      availableQty: depth,
      modelVersion: quote.modelVersion,
    });
  }

  return { offers };
}

export async function createNpcOrder(input: CreateNpcOrderInput) {
  const { userId, planetId, side, resourceId, quantity, expectedUnitPrice } = input;

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('quantity must be greater than 0');
  }
  if (!Number.isFinite(expectedUnitPrice) || expectedUnitPrice <= 0) {
    throw new Error('expectedUnitPrice must be greater than 0');
  }

  await assertPlanetOwnership(userId, planetId);

  const resource = await db.query.resources.findFirst({
    where: eq(resources.id, resourceId),
    columns: { id: true, tier: true, defaultStorageCap: true },
  });
  if (!resource) throw new Error('Resource not found');

  const quote = calculateNpcMarketQuote({
    resourceId: resourceId,
    tier: resource.tier,
    stockRatio: 1,
  });
  const actualUnitPrice = side === 'buy' ? quote.buyPrice : quote.sellPrice;
  const priceDelta = Math.abs(actualUnitPrice - expectedUnitPrice);
  if (priceDelta > 0.01) {
    throw new Error('Price moved, please refresh offers');
  }

  const requestedQty = Number(quantity.toFixed(4));
  const totalValue = Number((requestedQty * actualUnitPrice).toFixed(4));

  if (side === 'sell') {
    const spend = await spendResources(planetId, [{ resourceId, amount: requestedQty }]);
    if (!spend.success) throw new Error(spend.error || 'Failed to reserve sell resource');
  } else {
    // Buying increases this resource and reserves payment in iron.
    const current = await db.query.planetResources.findFirst({
      where: and(eq(planetResources.planetId, planetId), eq(planetResources.resourceId, resourceId)),
      columns: { amount: true },
    });
    const currentAmount = Number(current?.amount || 0);
    if (currentAmount + requestedQty > resource.defaultStorageCap) {
      throw new Error('Not enough storage capacity for buy order');
    }
    const spend = await spendResources(planetId, [{ resourceId: 'iron', amount: totalValue }]);
    if (!spend.success) throw new Error(spend.error || 'Failed to reserve buy payment');
  }

  const [order] = await db
    .insert(marketOrders)
    .values({
      userId,
      scope: 'npc',
      side,
      orderType: 'market',
      status: 'open',
      resourceId,
      requestedQty: requestedQty.toFixed(4),
      filledQty: '0',
      avgExecutedPrice: actualUnitPrice.toFixed(4),
      totalValue: totalValue.toFixed(4),
    })
    .returning();

  return {
    order: {
      id: order.id,
      status: order.status,
      resourceId: order.resourceId,
      side: order.side,
      requestedQty: order.requestedQty,
      totalValue: order.totalValue,
      avgExecutedPrice: order.avgExecutedPrice,
    },
  };
}

export async function cancelNpcOrder(input: CancelNpcOrderInput) {
  const { userId, orderId, planetId } = input;

  await assertPlanetOwnership(userId, planetId);
  const order = await db.query.marketOrders.findFirst({
    where: eq(marketOrders.id, orderId),
  });
  if (!order || order.userId !== userId) throw new Error('Order not found');
  if (!canTransitionMarketOrderStatus(order.status, 'cancelled')) {
    throw new Error(`Order cannot be cancelled from status ${order.status}`);
  }

  const remainingQty = Math.max(0, Number(order.requestedQty) - Number(order.filledQty));
  if (remainingQty > 0) {
    if (order.side === 'sell') {
      const gain = await gainResources(planetId, [{ resourceId: order.resourceId, amount: remainingQty }]);
      if (!gain.success) throw new Error(gain.error || 'Failed to return sell reservation');
    } else {
      const totalValue = Number(order.totalValue);
      const filledValue = Number(order.filledQty) * Number(order.avgExecutedPrice || 0);
      const refund = Math.max(0, Number((totalValue - filledValue).toFixed(4)));
      if (refund > 0) {
        const gain = await gainResources(planetId, [{ resourceId: 'iron', amount: refund }]);
        if (!gain.success) throw new Error(gain.error || 'Failed to return buy reservation');
      }
    }
  }

  const [updated] = await db
    .update(marketOrders)
    .set({
      status: 'cancelled',
      closedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(marketOrders.id, order.id))
    .returning();

  return { order: updated };
}
