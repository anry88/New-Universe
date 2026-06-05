import type { PlanetEnergyStatus, PlanetResource } from "@shared/types/world";

function finiteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function mergeLiveEnergyStatus(
  baseEnergy: PlanetEnergyStatus | null | undefined,
  liveResources: PlanetResource[] | null | undefined,
): PlanetEnergyStatus | null {
  const liveEnergy = liveResources?.find((row) => row.resourceId === "energy") ?? null;
  if (!baseEnergy && !liveEnergy) return null;

  const stored = finiteNumber(liveEnergy?.amount) ?? baseEnergy?.stored ?? 0;
  const capacity = finiteNumber(liveEnergy?.storageCap) ?? baseEnergy?.capacity ?? 0;
  const net = finiteNumber(liveEnergy?.regenRate) ?? baseEnergy?.net ?? 0;

  return {
    stored,
    capacity,
    produced: baseEnergy?.produced ?? Math.max(0, net),
    consumed: baseEnergy?.consumed ?? Math.max(0, -net),
    net,
    shortage: liveEnergy ? net < 0 && stored <= 0 : (baseEnergy?.shortage ?? false),
  };
}
