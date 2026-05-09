import { and, eq, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { marketOrderFills, marketOrders, planetResources, resources } from '../../db/schema.js';
import { gainResources } from '../resources/transactions.js';

type DbClient = typeof db;

interface LockedOrderRow {
  id: string;
  side: string;
  status: string;
  scope: string;
  resourceId: string;
  requestedQty: string;
  avgExecutedPrice: string | null;
  totalValue: string;
  planetId: string | null;
  deliveryReadyAt: Date | null;
}

function mapLockedRow(row: Record<string, unknown>): LockedOrderRow {
  return {
    id: String(row.id),
    side: String(row.side),
    status: String(row.status),
    scope: String(row.scope),
    resourceId: String(row.resource_id),
    requestedQty: String(row.requested_qty),
    avgExecutedPrice: row.avg_executed_price != null ? String(row.avg_executed_price) : null,
    totalValue: String(row.total_value),
    planetId: row.planet_id != null ? String(row.planet_id) : null,
    deliveryReadyAt: row.delivery_ready_at != null ? new Date(row.delivery_ready_at as string | Date) : null,
  };
}

async function loadHeadroom(
  tx: any,
  planetId: string,
  resourceId: string,
): Promise<{ current: number; cap: number }> {
  const pr = await tx.query.planetResources.findFirst({
    where: and(eq(planetResources.planetId, planetId), eq(planetResources.resourceId, resourceId)),
  });
  const res = await tx.query.resources.findFirst({
    where: eq(resources.id, resourceId),
    columns: { defaultStorageCap: true },
  });
  const current = Number(pr?.amount ?? 0);
  const cap = Number(res?.defaultStorageCap ?? 0);
  return { current, cap };
}

/**
 * Idempotent settlement for one NPC market order: locks the row, applies resources, writes fill row.
 * Safe under retries and concurrent workers (second caller sees non-open status and exits).
 */
export async function fulfillNpcMarketOrder(
  database: DbClient,
  orderId: string,
  now: Date = new Date(),
): Promise<void> {
  await database.transaction(async tx => {
    const locked = await tx.execute(sql`
      SELECT id, user_id, scope, side, status, resource_id, requested_qty, filled_qty,
             avg_executed_price, total_value, planet_id, delivery_ready_at
      FROM market_orders
      WHERE id = ${orderId}::uuid
      FOR UPDATE
    `);

    const rows = locked as unknown as Record<string, unknown>[];
    const raw = rows[0];
    if (!raw) return;

    const order = mapLockedRow(raw);
    if (order.status !== 'open' || order.scope !== 'npc') return;
    if (!order.planetId) return;

    if (order.deliveryReadyAt != null && order.deliveryReadyAt > now) return;

    const planetId = order.planetId;
    const requestedQty = Number(order.requestedQty);
    const unitPrice = Number(order.avgExecutedPrice ?? 0);
    const totalPayIron = Number(order.totalValue);

    if (order.side === 'sell') {
      const { current: ironCurrent, cap: ironCap } = await loadHeadroom(tx, planetId, 'iron');
      const ironHeadroom = Math.max(0, ironCap - ironCurrent);
      if (ironHeadroom < totalPayIron) {
        await gainResources(
          planetId,
          [{ resourceId: order.resourceId, amount: requestedQty }],
          tx,
        );
        await tx
          .update(marketOrders)
          .set({
            status: 'failed',
            closedAt: now,
            updatedAt: now,
          })
          .where(and(eq(marketOrders.id, orderId), eq(marketOrders.status, 'open')));
        return;
      }

      const ironGain = await gainResources(planetId, [{ resourceId: 'iron', amount: totalPayIron }], tx);
      if (!ironGain.success) {
        throw new Error(ironGain.error || 'Failed to credit iron for sell');
      }

      await tx
        .update(marketOrders)
        .set({
          status: 'filled',
          filledQty: requestedQty.toFixed(4),
          closedAt: now,
          updatedAt: now,
        })
        .where(and(eq(marketOrders.id, orderId), eq(marketOrders.status, 'open')));

      await tx.insert(marketOrderFills).values({
        orderId,
        resourceId: order.resourceId,
        qty: requestedQty.toFixed(4),
        pricePerUnit: unitPrice.toFixed(4),
        feeAmount: '0',
      });
      return;
    }

    if (order.side === 'buy') {
      const { current, cap } = await loadHeadroom(tx, planetId, order.resourceId);
      const headroom = Math.max(0, cap - current);
      const deliveredQty = Math.min(requestedQty, headroom);

      if (deliveredQty <= 0) {
        const refund = await gainResources(planetId, [{ resourceId: 'iron', amount: totalPayIron }], tx);
        if (!refund.success) throw new Error(refund.error || 'Failed to refund iron for blocked buy');
        await tx
          .update(marketOrders)
          .set({
            status: 'failed',
            filledQty: '0',
            closedAt: now,
            updatedAt: now,
          })
          .where(and(eq(marketOrders.id, orderId), eq(marketOrders.status, 'open')));
        return;
      }

      const ironUsed = Number((deliveredQty * unitPrice).toFixed(4));
      const ironRefund = Math.max(0, Number((totalPayIron - ironUsed).toFixed(4)));

      const gains = [
        { resourceId: order.resourceId, amount: deliveredQty },
        ...(ironRefund > 0 ? ([{ resourceId: 'iron', amount: ironRefund }] as const) : []),
      ];

      const gainResult = await gainResources(planetId, [...gains], tx);
      if (!gainResult.success) throw new Error(gainResult.error || 'Failed to deliver buy');

      await tx
        .update(marketOrders)
        .set({
          status: 'filled',
          filledQty: deliveredQty.toFixed(4),
          closedAt: now,
          updatedAt: now,
        })
        .where(and(eq(marketOrders.id, orderId), eq(marketOrders.status, 'open')));

      await tx.insert(marketOrderFills).values({
        orderId,
        resourceId: order.resourceId,
        qty: deliveredQty.toFixed(4),
        pricePerUnit: unitPrice.toFixed(4),
        feeAmount: '0',
      });
    }
  });
}

/**
 * Processes due NPC market orders (sell pays iron immediately once scheduled; buy respects ETA).
 */
export async function processNpcMarketFulfillment(
  database: DbClient = db,
  clock: () => Date = () => new Date(),
): Promise<void> {
  const now = clock();

  const due = await database
    .select({ id: marketOrders.id })
    .from(marketOrders)
    .where(
      and(
        eq(marketOrders.scope, 'npc'),
        eq(marketOrders.status, 'open'),
        isNotNull(marketOrders.planetId),
        or(isNull(marketOrders.deliveryReadyAt), lte(marketOrders.deliveryReadyAt, now)),
      ),
    );

  const ids = due.map(r => r.id);

  for (const id of ids) {
    await fulfillNpcMarketOrder(database, id, now);
  }
}
