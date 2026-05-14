import { describe, expect, it, vi } from 'vitest';
import {
  getShipClassTag,
  isShipTypeVisible,
  isShipTypeVisibleInShipyard,
  resolveShipType,
  SHIP_BY_TYPE,
  shipStatusTone,
} from './ships';

describe('ship icon resolver', () => {
  it('resolves active catalog ids to unique Cosmic Atlas hull entries', () => {
    expect(resolveShipType('scout')).toBe(SHIP_BY_TYPE.scout);
    expect(resolveShipType('cargo_light')).toBe(SHIP_BY_TYPE.cargo_light);
    expect(resolveShipType('colonizer')).toBe(SHIP_BY_TYPE.colonizer);
    expect(resolveShipType('recon_probe')).toBe(SHIP_BY_TYPE.recon_probe);
    expect(getShipClassTag('recon_probe', 'ru')).toBe('ЗОНД');
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
    expect(def.label).toBe('unknown_hull');
    expect(def).not.toBe(SHIP_BY_TYPE.scout);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
