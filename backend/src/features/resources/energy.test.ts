import { describe, expect, it } from 'vitest';
import { solarEnergyMultiplier, windEnergyMultiplier } from './energy.js';

describe('planet energy formulas', () => {
  it('makes solar output noticeably stronger on inner orbits than outer orbits', () => {
    const inner = solarEnergyMultiplier({ id: 'inner', name: 'home-1', biome: 'volcanic' });
    const outer = solarEnergyMultiplier({ id: 'outer', name: 'home-9', biome: 'ice' });

    expect(inner).toBeGreaterThan(outer);
    expect(inner - outer).toBeGreaterThan(0.8);
  });

  it('scales wind output by planet size as a mass proxy', () => {
    const small = windEnergyMultiplier({ size: 6 });
    const large = windEnergyMultiplier({ size: 24 });

    expect(large).toBeGreaterThan(small);
    expect(large / small).toBeGreaterThan(1.5);
  });
});
