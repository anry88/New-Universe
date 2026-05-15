export function deriveBuildingMaxHp(baseHp: number | undefined, level: number): number {
  const hp = baseHp ?? 1000;
  return hp * level;
}

export function deriveShipMaxHp(baseHp: number | undefined): number {
  return baseHp ?? 100;
}
