import { describe, expect, it } from 'vitest';
import { orderTopBarResources } from './ResourceBar';

describe('orderTopBarResources', () => {
  it('prioritizes starter construction resources before preserving the remaining order', () => {
    const rows = [
      { resourceId: 'water' },
      { resourceId: 'methane' },
      { resourceId: 'silicon' },
      { resourceId: 'iron' },
      { resourceId: 'tritium' },
      { resourceId: 'carbon' },
    ];

    expect(orderTopBarResources(rows).map((row) => row.resourceId)).toEqual([
      'iron',
      'silicon',
      'carbon',
      'water',
      'methane',
      'tritium',
    ]);
  });
});
