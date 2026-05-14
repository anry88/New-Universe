/**
 * Passive extraction rates in units/hour for resources selected by extractor buildings.
 *
 * The rates are intentionally resource-specific: common, progression-critical materials
 * are faster, while rare or late-game materials stay slower even in the same extractor type.
 */
export const EXTRACTABLE_RESOURCE_RATES_PER_HOUR = {
  water: 64,
  iron: 72,
  carbon: 58,
  silicon: 34,
  methane: 46,
  oxygen: 54,
  hydrogen: 50,
  copper: 28,
  aluminum: 22,
  silver: 18,
  titanium: 14,
  ice: 30,
  oil: 24,
  sulfur: 24,
  mercury: 8,
  magnesium: 8,
  lead: 7,
  nitrogen: 6,
  uranium: 3,
  cobalt: 5,
  silicon_carbide: 6,
  tritium: 2,
  gold: 5,
  iridium: 2,
  biomass: 4,
} as const satisfies Record<string, number>;

export type ExtractableResourceId = keyof typeof EXTRACTABLE_RESOURCE_RATES_PER_HOUR;

export function extractionRateForResource(resourceId: string, fallbackRate = 0): number {
  return EXTRACTABLE_RESOURCE_RATES_PER_HOUR[resourceId as ExtractableResourceId] ?? fallbackRate;
}
