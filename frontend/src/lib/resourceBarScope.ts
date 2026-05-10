/**
 * Relative URL for live planet inventory used by `ResourceBar` (`GET` → `{ resources }`).
 * Backend: resources routes at `/resources`, handler `/planets/:planetId`.
 */
export function planetInventoryApiPath(planetId: string): string {
  return `/resources/planets/${planetId}`;
}
