import { and, eq, sql } from 'drizzle-orm';
import { db as defaultDb } from '../../db/index.js';
import { ships } from '../../db/schema.js';
import {
  type RefuelErrorCode,
  type RefuelErrorDetails,
  type RefuelRequest,
  type RefuelResponse,
  formatRefuelErrorMessage,
} from '@shared/types/refuel.js';

export interface RefuelResult {
  success: boolean;
  status: number;
  data?: RefuelResponse;
  error?: string;
  code?: RefuelErrorCode;
  details?: Omit<RefuelErrorDetails, 'code'>;
}

function refuelFailure(status: number, details: RefuelErrorDetails): RefuelResult {
  const { code, ...rest } = details;
  return {
    success: false,
    status,
    error: formatRefuelErrorMessage(details, 'en'),
    code,
    details: rest,
  };
}

export async function refuelShip(
  userId: string,
  req: RefuelRequest,
): Promise<RefuelResult> {
  const { targetShipId, sourceShipId, fuel = 0, jumpFuel = 0 } = req;
  const db = defaultDb;

  if (targetShipId === sourceShipId) {
    return refuelFailure(400, { code: 'refuel_same_ship' });
  }

  if (fuel <= 0 && jumpFuel <= 0) {
    return refuelFailure(400, { code: 'refuel_no_fuel_requested' });
  }

  const targetShipRow = await db.query.ships.findFirst({
    where: and(eq(ships.id, targetShipId), eq(ships.ownerId, userId)),
    with: { type: true },
  });

  if (!targetShipRow) {
    return refuelFailure(404, { code: 'refuel_target_not_found' });
  }

  const sourceShipRow = await db.query.ships.findFirst({
    where: and(eq(ships.id, sourceShipId), eq(ships.ownerId, userId)),
    with: { type: true },
  });

  if (!sourceShipRow) {
    return refuelFailure(404, { code: 'refuel_source_not_found' });
  }

  if (sourceShipRow.typeId !== 'refueler') {
    return refuelFailure(400, { code: 'refuel_source_not_refueler' });
  }

  if (targetShipRow.status !== 'idle' || sourceShipRow.status !== 'idle') {
    return refuelFailure(400, { code: 'refuel_ship_not_idle' });
  }

  if (targetShipRow.locationPlanetId !== sourceShipRow.locationPlanetId || !targetShipRow.locationPlanetId) {
    return refuelFailure(400, { code: 'refuel_not_same_planet' });
  }

  const targetType = targetShipRow.type;
  const sourceShipCurrentFuel = Number(sourceShipRow.fuel);
  const sourceShipCurrentJumpFuel = Number(sourceShipRow.jumpFuel);
  const targetShipCurrentFuel = Number(targetShipRow.fuel);
  const targetShipCurrentJumpFuel = Number(targetShipRow.jumpFuel);

  // Validate ordinary fuel transfer
  if (fuel > 0) {
    if (fuel > sourceShipCurrentFuel) {
      return refuelFailure(400, { 
        code: 'refuel_source_insufficient', 
        fuelType: 'fuel', 
        available: sourceShipCurrentFuel, 
        requested: fuel 
      });
    }
    if (targetShipCurrentFuel + fuel > targetType.fuelCapacity) {
      return refuelFailure(400, { 
        code: 'refuel_exceeds_tank', 
        fuelType: 'fuel', 
        capacity: targetType.fuelCapacity, 
        current: targetShipCurrentFuel, 
        requested: fuel 
      });
    }
  }

  // Validate jump fuel transfer
  if (jumpFuel > 0) {
    if (jumpFuel > sourceShipCurrentJumpFuel) {
      return refuelFailure(400, { 
        code: 'refuel_source_insufficient', 
        fuelType: 'jump_fuel', 
        available: sourceShipCurrentJumpFuel, 
        requested: jumpFuel 
      });
    }
    if (targetShipCurrentJumpFuel + jumpFuel > targetType.jumpFuelCapacity) {
      return refuelFailure(400, { 
        code: 'refuel_exceeds_tank', 
        fuelType: 'jump_fuel', 
        capacity: targetType.jumpFuelCapacity, 
        current: targetShipCurrentJumpFuel, 
        requested: jumpFuel 
      });
    }
  }

  return await db.transaction(async (tx) => {
    const [updatedTarget] = await tx
      .update(ships)
      .set({
        fuel: sql`${ships.fuel} + ${fuel}`,
        jumpFuel: sql`${ships.jumpFuel} + ${jumpFuel}`,
      })
      .where(eq(ships.id, targetShipId))
      .returning();

    const [updatedSource] = await tx
      .update(ships)
      .set({
        fuel: sql`${ships.fuel} - ${fuel}`,
        jumpFuel: sql`${ships.jumpFuel} - ${jumpFuel}`,
      })
      .where(eq(ships.id, sourceShipId))
      .returning();

    return {
      success: true,
      status: 200,
      data: {
        success: true,
        targetShip: {
          id: updatedTarget.id,
          fuel: updatedTarget.fuel,
          jumpFuel: updatedTarget.jumpFuel,
        },
        sourceShip: {
          id: updatedSource.id,
          fuel: updatedSource.fuel,
          jumpFuel: updatedSource.jumpFuel,
        },
      },
    };
  });
}
