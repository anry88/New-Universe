import { and, eq, inArray } from 'drizzle-orm';
import { db as defaultDb } from '../../db/index.js';
import { ships, shipTypes } from '../../db/schema.js';
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

  if (
    !Number.isFinite(fuel) ||
    !Number.isFinite(jumpFuel) ||
    fuel < 0 ||
    jumpFuel < 0 ||
    (fuel <= 0 && jumpFuel <= 0)
  ) {
    return refuelFailure(400, { code: 'refuel_no_fuel_requested' });
  }

  return await db.transaction(async (tx) => {
    const lockedRows = await tx
      .select({
        id: ships.id,
        ownerId: ships.ownerId,
        typeId: ships.typeId,
        status: ships.status,
        locationPlanetId: ships.locationPlanetId,
        fuel: ships.fuel,
        jumpFuel: ships.jumpFuel,
        fuelCapacity: shipTypes.fuelCapacity,
        jumpFuelCapacity: shipTypes.jumpFuelCapacity,
      })
      .from(ships)
      .innerJoin(shipTypes, eq(shipTypes.id, ships.typeId))
      .where(and(eq(ships.ownerId, userId), inArray(ships.id, [targetShipId, sourceShipId])))
      .orderBy(ships.id)
      .for('update');

    const targetShipRow = lockedRows.find((ship) => ship.id === targetShipId);
    const sourceShipRow = lockedRows.find((ship) => ship.id === sourceShipId);

    if (!targetShipRow) {
      return refuelFailure(404, { code: 'refuel_target_not_found' });
    }

    if (!sourceShipRow) {
      return refuelFailure(404, { code: 'refuel_source_not_found' });
    }

    if (sourceShipRow.typeId !== 'refueler') {
      return refuelFailure(400, { code: 'refuel_source_not_refueler' });
    }

    if (targetShipRow.status !== 'idle' || sourceShipRow.status !== 'idle') {
      return refuelFailure(400, { code: 'refuel_ship_not_idle' });
    }

    if (
      targetShipRow.locationPlanetId !== sourceShipRow.locationPlanetId ||
      !targetShipRow.locationPlanetId
    ) {
      return refuelFailure(400, { code: 'refuel_not_same_planet' });
    }

    const sourceShipCurrentFuel = Number(sourceShipRow.fuel);
    const sourceShipCurrentJumpFuel = Number(sourceShipRow.jumpFuel);
    const targetShipCurrentFuel = Number(targetShipRow.fuel);
    const targetShipCurrentJumpFuel = Number(targetShipRow.jumpFuel);

    if (fuel > 0) {
      if (fuel > sourceShipCurrentFuel) {
        return refuelFailure(400, {
          code: 'refuel_source_insufficient',
          fuelType: 'fuel',
          available: sourceShipCurrentFuel,
          requested: fuel,
        });
      }
      if (targetShipCurrentFuel + fuel > targetShipRow.fuelCapacity) {
        return refuelFailure(400, {
          code: 'refuel_exceeds_tank',
          fuelType: 'fuel',
          capacity: targetShipRow.fuelCapacity,
          current: targetShipCurrentFuel,
          requested: fuel,
        });
      }
    }

    if (jumpFuel > 0) {
      if (jumpFuel > sourceShipCurrentJumpFuel) {
        return refuelFailure(400, {
          code: 'refuel_source_insufficient',
          fuelType: 'jump_fuel',
          available: sourceShipCurrentJumpFuel,
          requested: jumpFuel,
        });
      }
      if (targetShipCurrentJumpFuel + jumpFuel > targetShipRow.jumpFuelCapacity) {
        return refuelFailure(400, {
          code: 'refuel_exceeds_tank',
          fuelType: 'jump_fuel',
          capacity: targetShipRow.jumpFuelCapacity,
          current: targetShipCurrentJumpFuel,
          requested: jumpFuel,
        });
      }
    }

    const targetFuelAfter = targetShipCurrentFuel + fuel;
    const targetJumpFuelAfter = targetShipCurrentJumpFuel + jumpFuel;
    const sourceFuelAfter = sourceShipCurrentFuel - fuel;
    const sourceJumpFuelAfter = sourceShipCurrentJumpFuel - jumpFuel;

    const [updatedTarget] = await tx
      .update(ships)
      .set({
        fuel: targetFuelAfter.toFixed(2),
        jumpFuel: targetJumpFuelAfter.toFixed(2),
      })
      .where(eq(ships.id, targetShipId))
      .returning();

    const [updatedSource] = await tx
      .update(ships)
      .set({
        fuel: sourceFuelAfter.toFixed(2),
        jumpFuel: sourceJumpFuelAfter.toFixed(2),
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
