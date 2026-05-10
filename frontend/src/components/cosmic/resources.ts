/**
 * Resource symbol mapping used by the Cosmic Atlas resource chip.
 * Falls back to the resource id (uppercased) for unknown ids.
 */

interface ResourceMeta {
  symbol: string;
  full?: string;
}

const RESOURCE_META: Record<string, ResourceMeta> = {
  water: { symbol: 'H₂O', full: 'Water' },
  iron: { symbol: 'Fe', full: 'Iron' },
  silicon: { symbol: 'Si', full: 'Silicon' },
  methane: { symbol: 'CH₄', full: 'Methane' },
  tritium: { symbol: 'T₂', full: 'Tritium' },
  carbon: { symbol: 'C', full: 'Carbon' },
  copper: { symbol: 'Cu', full: 'Copper' },
  aluminum: { symbol: 'Al', full: 'Aluminum' },
  titanium: { symbol: 'Ti', full: 'Titanium' },
  ice: { symbol: 'H₂O*', full: 'Ice' },
  oil: { symbol: 'Oil', full: 'Oil' },
  sulfur: { symbol: 'S', full: 'Sulfur' },
  mercury: { symbol: 'Hg', full: 'Mercury' },
  magnesium: { symbol: 'Mg', full: 'Magnesium' },
  lead: { symbol: 'Pb', full: 'Lead' },
  uranium: { symbol: 'U', full: 'Uranium' },
  cobalt: { symbol: 'Co', full: 'Cobalt' },
  silicon_carbide: { symbol: 'SiC', full: 'Silicon Carbide' },
  antimatter: { symbol: 'Am', full: 'Antimatter' },
  dark_matter: { symbol: 'Dm', full: 'Dark Matter' },
  iridium: { symbol: 'Ir', full: 'Iridium' },
  biomass: { symbol: 'Bio', full: 'Biomass' },
  energy: { symbol: '⚡', full: 'Energy' },
};

export function getResourceSymbol(resourceId: string): string {
  const meta = RESOURCE_META[resourceId.toLowerCase()];
  if (meta) return meta.symbol;
  // Fallback: uppercase first 3 chars, or full id if shorter.
  return resourceId.length > 3
    ? resourceId.slice(0, 3).toUpperCase()
    : resourceId.toUpperCase();
}

export function getResourceLabel(resourceId: string): string {
  return RESOURCE_META[resourceId.toLowerCase()]?.full ?? resourceId;
}

/**
 * Calculates fresh resource amount based on regen rate per hour.
 * Acceptance criteria: regenRate is divided by 3600 for per-second increment.
 */
export function calculateRegen(
  currentAmount: number,
  regenRatePerHour: number,
  deltaSeconds: number,
  storageCap: number
): number {
  const regenRatePerSecond = regenRatePerHour / 3600;
  return Math.min(currentAmount + regenRatePerSecond * deltaSeconds, storageCap);
}
