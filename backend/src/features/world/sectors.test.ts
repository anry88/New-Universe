import { describe, it, expect, beforeEach } from 'vitest';
import { getOrCreateSector } from './sectors.js';
import { db } from '../../db/index.js';
import { sectors } from '../../db/schema.js';

describe('getOrCreateSector', () => {
  beforeEach(async () => {
    await db.delete(sectors);
  });

  it('should create a new sector if it does not exist', async () => {
    const result = await getOrCreateSector(1, 2, 3);

    expect(result).toBeDefined();
    expect(result.x).toBe(1);
    expect(result.y).toBe(2);
    expect(result.z).toBe(3);
    expect(result.seed).toBeDefined();
    expect(result.systemCount).toBe(0);
  });

  it('should return existing sector on repeated call (idempotency)', async () => {
    const first = await getOrCreateSector(1, 2, 3);
    const second = await getOrCreateSector(1, 2, 3);

    expect(first.id).toBe(second.id);
    expect(first.seed).toBe(second.seed);

    const allSectors = await db.select().from(sectors);
    expect(allSectors).toHaveLength(1);
  });

  it('should generate deterministic seed for same coordinates', async () => {
    const first = await getOrCreateSector(0, 0, 0);
    await db.delete(sectors);
    const second = await getOrCreateSector(0, 0, 0);

    expect(first.seed).toBe(second.seed);
  });

  it('should create different sectors for different coordinates', async () => {
    const sector1 = await getOrCreateSector(1, 2, 3);
    const sector2 = await getOrCreateSector(4, 5, 6);

    expect(sector1.id).not.toBe(sector2.id);
    expect(sector1.x).toBe(1);
    expect(sector1.y).toBe(2);
    expect(sector1.z).toBe(3);
    expect(sector2.x).toBe(4);
    expect(sector2.y).toBe(5);
    expect(sector2.z).toBe(6);
  });
});
