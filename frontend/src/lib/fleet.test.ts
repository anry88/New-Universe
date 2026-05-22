import { describe, expect, it } from 'vitest';
import { formatCargoTransferError, isCargoTransferShip } from './fleet';

const shipTypes = [
  { id: 'scout', role: 'recon', cargo: 50 },
  { id: 'cargo_light', role: 'logistics', cargo: 5000 },
  { id: 'cargo_medium', role: 'logistics', cargo: 15000 },
  { id: 'colonizer', role: 'colonization', cargo: 1 },
];

const t = (key: string, params?: Record<string, string | number>) =>
  params ? `${key}:${JSON.stringify(params)}` : key;

describe('fleet helpers', () => {
  it('allows only logistics ships into cargo transfer flows', () => {
    expect(isCargoTransferShip({ typeId: 'cargo_light' }, shipTypes)).toBe(true);
    expect(isCargoTransferShip({ typeId: 'cargo_light' }, undefined)).toBe(true);
    expect(isCargoTransferShip({ typeId: 'cargo_medium' }, shipTypes)).toBe(true);
    expect(isCargoTransferShip({ typeId: 'cargo_heavy' }, undefined)).toBe(true);
    expect(isCargoTransferShip({ typeId: 'scout' }, shipTypes)).toBe(false);
    expect(isCargoTransferShip({ typeId: 'colonizer' }, shipTypes)).toBe(false);
  });

  it('maps server cargo errors to localized keys', () => {
    expect(formatCargoTransferError('Ship cannot transfer cargo', t)).toBe('cargo.error.notCargoShip');
    expect(formatCargoTransferError('Origin planet is not owned by you', t)).toBe('cargo.error.originNotOwned');
    expect(formatCargoTransferError('Cargo (6000) exceeds ship capacity (5000)', t)).toBe(
      'cargo.error.capacityExceededServer:{"total":"6000","capacity":"5000"}',
    );
    expect(formatCargoTransferError('not enough fuel', t)).toBe('cargo.error.insufficientFuel');
    expect(formatCargoTransferError('not enough jump_fuel', t)).toBe('cargo.error.insufficientJumpFuel');
    expect(formatCargoTransferError('not enough jump fuel', t)).toBe('cargo.error.insufficientJumpFuel');
    expect(formatCargoTransferError('Ship fuel tank capacity (100) is insufficient for this cargo route', t)).toBe(
      'cargo.error.fuelTankCapacity',
    );
    expect(formatCargoTransferError('Ship jump fuel tank capacity (50) is insufficient for this cargo route', t)).toBe(
      'cargo.error.jumpFuelTankCapacity',
    );
    expect(formatCargoTransferError('Cargo transfer: logistics research level 1 required', t)).toBe(
      'cargo.error.logisticsRequired',
    );
    expect(formatCargoTransferError('Jump Drive research level 1 required', t)).toBe('cargo.error.jumpGateLocked');
    expect(formatCargoTransferError('Jump Gate cargo route requires a different target system', t)).toBe(
      'cargo.error.jumpGateLocal',
    );
    expect(formatCargoTransferError('Target common system is not a known Jump Gate destination', t)).toBe(
      'cargo.error.jumpGateUnknownCommon',
    );
    expect(formatCargoTransferError('Origin system is not a public Jump Gate target', t)).toBe(
      'cargo.error.jumpGatePublicOnly',
    );
  });
});
