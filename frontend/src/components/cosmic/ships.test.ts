import { describe, expect, it, vi } from 'vitest';
import { SHIP_ENTITY_LABELS } from '@shared/types/entity-labels';
import {
  getShipClassTag,
  isShipTypeVisible,
  isShipTypeVisibleInShipyard,
  resolveShipType,
  SHIP_BY_TYPE,
  shipStatusTone,
} from './ships';

describe('ship icon resolver', () => {
  it('keeps every shared ship label backed by a Cosmic Atlas hull entry', () => {
    expect(Object.keys(SHIP_BY_TYPE).sort()).toEqual(Object.keys(SHIP_ENTITY_LABELS).sort());
  });

  it('resolves active catalog ids to unique Cosmic Atlas hull entries', () => {
    expect(resolveShipType('scout')).toBe(SHIP_BY_TYPE.scout);
    expect(resolveShipType('cargo_light')).toBe(SHIP_BY_TYPE.cargo_light);
    expect(resolveShipType('colonizer')).toBe(SHIP_BY_TYPE.colonizer);
    expect(resolveShipType('recon_probe')).toBe(SHIP_BY_TYPE.recon_probe);
    expect(resolveShipType('medium_fighter')).toBe(SHIP_BY_TYPE.medium_fighter);
    expect(resolveShipType('medium_shield_ship')).toBe(SHIP_BY_TYPE.medium_shield_ship);
    expect(resolveShipType('heavy_bomber')).toBe(SHIP_BY_TYPE.heavy_bomber);
    expect(resolveShipType('large_shield_ship')).toBe(SHIP_BY_TYPE.large_shield_ship);
    expect(resolveShipType('rocket_carrier')).toBe(SHIP_BY_TYPE.rocket_carrier);
    expect(resolveShipType('heavy_rocket_carrier')).toBe(SHIP_BY_TYPE.heavy_rocket_carrier);
    expect(resolveShipType('nuclear_carrier')).toBe(SHIP_BY_TYPE.nuclear_carrier);
    expect(getShipClassTag('recon_probe', 'ru')).toBe('ЗОНД');
    expect(getShipClassTag('small_shield_ship', 'en')).toBe('SHIELD');
    expect(getShipClassTag('rocket_carrier', 'en')).toBe('CARRIER');
    expect(getShipClassTag('nuclear_carrier', 'en')).toBe('NUCLEAR');
    expect(getShipClassTag('nuclear_carrier', 'ru')).toBe('ЯДЕРНЫЙ');
  });

  it('keeps recon probes visible for random Jump Gate discovery', () => {
    expect(isShipTypeVisibleInShipyard('recon_probe')).toBe(true);
    expect(isShipTypeVisible('recon_probe')).toBe(true);
  });

  it('uses stable tones for ship lifecycle states', () => {
    expect(shipStatusTone('idle')).toBe('#5BFFA9');
    expect(shipStatusTone('moving')).toBe('#5BD7FF');
    expect(shipStatusTone('building')).toBe('#F4B84A');
  });

  it('returns a placeholder for unknown ship types', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const def = resolveShipType('unknown_hull');
    expect(def.label).toBe('Unknown Hull');
    expect(def.tag).toBe('SHIP');
    expect(def.label).not.toContain('_');
    expect(def).not.toBe(SHIP_BY_TYPE.scout);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
