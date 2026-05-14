import type { Ship, ShipType } from '@shared/types/ships';

type Translate = (key: string, params?: Record<string, string | number>) => string;
const CARGO_TRANSFER_TYPE_IDS = new Set(['cargo', 'cargo_light']);

export function isCargoTransferShipType(
  shipType: Pick<ShipType, 'id' | 'role' | 'cargo'> | null | undefined,
): boolean {
  if (!shipType) return false;
  return (
    (shipType.role === 'logistics' || CARGO_TRANSFER_TYPE_IDS.has(shipType.id)) &&
    Number(shipType.cargo) > 0
  );
}

export function isCargoTransferShip(
  ship: Pick<Ship, 'typeId'>,
  shipTypes: Pick<ShipType, 'id' | 'role' | 'cargo'>[] | undefined,
): boolean {
  const shipType = shipTypes?.find((type) => type.id === ship.typeId);
  return shipType
    ? isCargoTransferShipType(shipType)
    : CARGO_TRANSFER_TYPE_IDS.has(ship.typeId);
}

export function formatCargoTransferError(message: string | undefined, t: Translate): string {
  const value = message?.trim();
  const normalized = value?.toLowerCase() ?? '';
  const capacityMatch = value?.match(/Cargo \((\d+(?:\.\d+)?)\) exceeds ship capacity \((\d+(?:\.\d+)?)\)/i);

  if (!value) return t('cargo.transferFailed');
  if (normalized.includes('ship not found')) return t('cargo.error.shipNotFound');
  if (normalized.includes('ship is not idle')) return t('cargo.error.shipNotIdle');
  if (normalized.includes('ship is not on a planet')) return t('cargo.error.shipNotOnPlanet');
  if (normalized.includes('cannot transfer cargo')) return t('cargo.error.notCargoShip');
  if (normalized.includes('origin planet is not owned')) return t('cargo.error.originNotOwned');
  if (normalized.includes('target planet not found')) return t('cargo.error.targetNotFound');
  if (normalized.includes('target planet is not owned')) return t('cargo.error.targetNotOwned');
  if (normalized.includes('target planet must be different')) return t('cargo.error.samePlanet');
  if (normalized.includes('not enough fuel')) return t('cargo.error.insufficientFuel');
  if (normalized.includes('not enough jump_fuel') || normalized.includes('not enough jump fuel')) {
    return t('cargo.error.insufficientJumpFuel');
  }
  if (normalized.includes('logistics research level 1 required')) return t('cargo.error.logisticsRequired');
  if (normalized.includes('jump drive research level 1 required')) return t('cargo.error.jumpGateLocked');
  if (normalized.includes('jump gate is locked')) return t('cargo.error.jumpGateLocked');
  if (normalized.includes('jump gate calibration is still in progress')) return t('cargo.error.jumpGateCalibrating');
  if (normalized.includes('jump gate cargo route requires a different target system')) {
    return t('cargo.error.jumpGateLocal');
  }
  if (normalized.includes('common system is not a known jump gate destination')) {
    return t('cargo.error.jumpGateUnknownCommon');
  }
  if (normalized.includes('system is not a public jump gate target')) {
    return t('cargo.error.jumpGatePublicOnly');
  }
  if (capacityMatch) {
    return t('cargo.error.capacityExceededServer', {
      total: capacityMatch[1]!,
      capacity: capacityMatch[2]!,
    });
  }
  if (normalized.includes('not enough')) return t('cargo.error.insufficientResources');

  return t('cargo.transferFailed');
}
