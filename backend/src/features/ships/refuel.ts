import { and, eq, inArray } from "drizzle-orm";
import { db as defaultDb } from "../../db/index.js";
import { ships, shipTypes } from "../../db/schema.js";
import { getPlayerPlanetSettlement } from "../colonies/ownership.js";
import { spendResources } from "../resources/transactions.js";
import { JUMP_FUEL_RESOURCE_ID } from "@shared/config/expeditionRouting.js";
import {
  type RefuelErrorCode,
  type RefuelErrorDetails,
  type RefuelRequest,
  type RefuelResponse,
  formatRefuelErrorMessage,
} from "@shared/types/refuel.js";

export interface RefuelResult {
  success: boolean;
  status: number;
  data?: RefuelResponse;
  error?: string;
  code?: RefuelErrorCode;
  details?: Omit<RefuelErrorDetails, "code">;
}

function refuelFailure(
  status: number,
  details: RefuelErrorDetails,
): RefuelResult {
  const { code, ...rest } = details;
  return {
    success: false,
    status,
    error: formatRefuelErrorMessage(details, "en"),
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
    return refuelFailure(400, { code: "refuel_same_ship" });
  }

  if (
    !Number.isFinite(fuel) ||
    !Number.isFinite(jumpFuel) ||
    fuel < 0 ||
    jumpFuel < 0 ||
    (fuel <= 0 && jumpFuel <= 0)
  ) {
    return refuelFailure(400, { code: "refuel_no_fuel_requested" });
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
        refuelFuel: ships.refuelFuel,
        refuelJumpFuel: ships.refuelJumpFuel,
        fuelCapacity: shipTypes.fuelCapacity,
        jumpFuelCapacity: shipTypes.jumpFuelCapacity,
        refuelFuelCapacity: shipTypes.refuelFuelCapacity,
        refuelJumpFuelCapacity: shipTypes.refuelJumpFuelCapacity,
      })
      .from(ships)
      .innerJoin(shipTypes, eq(shipTypes.id, ships.typeId))
      .where(
        and(
          eq(ships.ownerId, userId),
          inArray(ships.id, [targetShipId, sourceShipId]),
        ),
      )
      .orderBy(ships.id)
      .for("update");

    const targetShipRow = lockedRows.find((ship) => ship.id === targetShipId);
    const sourceShipRow = lockedRows.find((ship) => ship.id === sourceShipId);

    if (!targetShipRow) {
      return refuelFailure(404, { code: "refuel_target_not_found" });
    }

    if (!sourceShipRow) {
      return refuelFailure(404, { code: "refuel_source_not_found" });
    }

    if (sourceShipRow.typeId !== "refueler") {
      return refuelFailure(400, { code: "refuel_source_not_refueler" });
    }

    if (targetShipRow.status !== "idle" || sourceShipRow.status !== "idle") {
      return refuelFailure(400, { code: "refuel_ship_not_idle" });
    }

    if (
      targetShipRow.locationPlanetId !== sourceShipRow.locationPlanetId ||
      !targetShipRow.locationPlanetId
    ) {
      return refuelFailure(400, { code: "refuel_not_same_planet" });
    }

    const sourceShipCurrentRefuelFuel = Number(sourceShipRow.refuelFuel);
    const sourceShipCurrentRefuelJumpFuel = Number(
      sourceShipRow.refuelJumpFuel,
    );
    const targetShipCurrentFuel = Number(targetShipRow.fuel);
    const targetShipCurrentJumpFuel = Number(targetShipRow.jumpFuel);

    if (fuel > 0) {
      if (fuel > sourceShipRow.refuelFuelCapacity) {
        return refuelFailure(400, {
          code: "refuel_source_insufficient",
          fuelType: "fuel",
          available: Math.max(0, sourceShipRow.refuelFuelCapacity),
          requested: fuel,
        });
      }
      if (targetShipCurrentFuel + fuel > targetShipRow.fuelCapacity) {
        return refuelFailure(400, {
          code: "refuel_exceeds_tank",
          fuelType: "fuel",
          capacity: targetShipRow.fuelCapacity,
          current: targetShipCurrentFuel,
          requested: fuel,
        });
      }
    }

    if (jumpFuel > 0) {
      if (jumpFuel > sourceShipRow.refuelJumpFuelCapacity) {
        return refuelFailure(400, {
          code: "refuel_source_insufficient",
          fuelType: "jump_fuel",
          available: Math.max(0, sourceShipRow.refuelJumpFuelCapacity),
          requested: jumpFuel,
        });
      }
      if (
        targetShipCurrentJumpFuel + jumpFuel >
        targetShipRow.jumpFuelCapacity
      ) {
        return refuelFailure(400, {
          code: "refuel_exceeds_tank",
          fuelType: "jump_fuel",
          capacity: targetShipRow.jumpFuelCapacity,
          current: targetShipCurrentJumpFuel,
          requested: jumpFuel,
        });
      }
    }

    const fuelNeededFromPlanet = Math.max(
      0,
      fuel - sourceShipCurrentRefuelFuel,
    );
    const jumpFuelNeededFromPlanet = Math.max(
      0,
      jumpFuel - sourceShipCurrentRefuelJumpFuel,
    );

    if (fuelNeededFromPlanet > 0 || jumpFuelNeededFromPlanet > 0) {
      const settlement = await getPlayerPlanetSettlement(
        userId,
        sourceShipRow.locationPlanetId!,
        tx,
      );
      if (!settlement?.isSettled) {
        const missingFuelType = fuelNeededFromPlanet > 0 ? "fuel" : "jump_fuel";
        return refuelFailure(400, {
          code: "refuel_source_insufficient",
          fuelType: missingFuelType,
          available:
            missingFuelType === "fuel"
              ? sourceShipCurrentRefuelFuel
              : sourceShipCurrentRefuelJumpFuel,
          requested: missingFuelType === "fuel" ? fuel : jumpFuel,
        });
      }

      const fuelLoadCosts = [];
      if (fuelNeededFromPlanet > 0) {
        fuelLoadCosts.push({
          resourceId: "fuel",
          amount: fuelNeededFromPlanet,
        });
      }
      if (jumpFuelNeededFromPlanet > 0) {
        fuelLoadCosts.push({
          resourceId: JUMP_FUEL_RESOURCE_ID,
          amount: jumpFuelNeededFromPlanet,
        });
      }

      const spendResult = await spendResources(
        sourceShipRow.locationPlanetId!,
        fuelLoadCosts,
        tx,
      );
      if (!spendResult.success) {
        const resourceId = spendResult.details?.resourceId;
        const fuelType =
          resourceId === JUMP_FUEL_RESOURCE_ID ? "jump_fuel" : "fuel";
        const reserveAvailable =
          fuelType === "jump_fuel"
            ? sourceShipCurrentRefuelJumpFuel
            : sourceShipCurrentRefuelFuel;
        return refuelFailure(400, {
          code: "refuel_source_insufficient",
          fuelType,
          available:
            reserveAvailable + Number(spendResult.details?.available ?? 0),
          requested: fuelType === "jump_fuel" ? jumpFuel : fuel,
        });
      }
    }

    const targetFuelAfter = targetShipCurrentFuel + fuel;
    const targetJumpFuelAfter = targetShipCurrentJumpFuel + jumpFuel;
    const sourceRefuelFuelAfter =
      sourceShipCurrentRefuelFuel + fuelNeededFromPlanet - fuel;
    const sourceRefuelJumpFuelAfter =
      sourceShipCurrentRefuelJumpFuel + jumpFuelNeededFromPlanet - jumpFuel;

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
        refuelFuel: sourceRefuelFuelAfter.toFixed(2),
        refuelJumpFuel: sourceRefuelJumpFuelAfter.toFixed(2),
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
          refuelFuel: updatedSource.refuelFuel,
          refuelJumpFuel: updatedSource.refuelJumpFuel,
        },
      },
    };
  });
}
