import { describe, expect, it } from 'vitest';
import { planetInventoryApiPath } from './resourceBarScope';

describe('planetInventoryApiPath', () => {
  it('includes planet id for scoped inventory fetch', () => {
    expect(planetInventoryApiPath('550e8400-e29b-41d4-a716-446655440000')).toBe(
      '/resources/planets/550e8400-e29b-41d4-a716-446655440000',
    );
  });

  it('changes when focal planet id changes', () => {
    const a = planetInventoryApiPath('planet-a');
    const b = planetInventoryApiPath('planet-b');
    expect(a).not.toBe(b);
    expect(a).toContain('planet-a');
    expect(b).toContain('planet-b');
  });
});
