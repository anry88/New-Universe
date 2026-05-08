import { db as defaultDb } from '../../db/index.js';
import { sectors } from '../../db/schema.js';

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash;
}

function createDeterministicSeed(x: number, y: number, z: number): number {
  const coordString = `${x},${y},${z}`;
  return hashString(coordString);
}

export async function getOrCreateSector(x: number, y: number, z: number, tx?: any) {
  const database = tx || defaultDb;

  const existing = await database.query.sectors.findFirst({
    where: (sectors: any, { and, eq }: any) => and(
      eq(sectors.x, x),
      eq(sectors.y, y),
      eq(sectors.z, z)
    ),
  });

  if (existing) {
    return existing;
  }

  const seed = createDeterministicSeed(x, y, z);

  const [sector] = await database.insert(sectors).values({
    x,
    y,
    z,
    seed,
  }).returning();

  return sector;
}
