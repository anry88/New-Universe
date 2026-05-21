import {
  formatCommonSystemDisplayName,
  homeSystemShortTag,
  type HomeNamingLocale,
} from "@shared/format/homeSystemNaming";
import type { JumpGateKnownDestinationSummary } from "@shared/types/jump-gate";
import type { HomeSystem, Planet } from "@shared/types/world";

function commonSystemDisplayName(
  destination: JumpGateKnownDestinationSummary,
  locale: string,
) {
  const namingLocale: HomeNamingLocale = locale === "ru" ? "ru" : "en";
  return formatCommonSystemDisplayName(
    namingLocale,
    destination.shortTag ?? homeSystemShortTag(destination.systemId),
  );
}

export function destinationSystemDisplayName(
  destination: JumpGateKnownDestinationSummary,
  locale: string,
) {
  if (destination.renameCount > 0 && destination.systemName) {
    return destination.systemName;
  }

  return commonSystemDisplayName(destination, locale);
}

export function destinationToSystem(
  destination: JumpGateKnownDestinationSummary,
  locale: string,
): HomeSystem {
  const planets: Planet[] = destination.planets
    .filter((planet) => planet.isDiscovered)
    .map((planet) => ({
      id: planet.id,
      systemId: planet.systemId,
      biome: planet.biome ?? "unknown",
      size: planet.size ?? 10,
      slotCount: planet.slotCount ?? 0,
      name: planet.name ?? `#${planet.orbitIndex}`,
      orbitIndex: planet.orbitIndex,
      isDiscovered: true,
      isColonized: planet.isColonized,
      isOwnedColony: planet.isOwnedColony,
      buildingCount: planet.buildingCount,
      lastCombatTickAt: planet.lastCombatTickAt,
      resources: planet.resources ?? [],
    }));

  return {
    id: destination.systemId,
    ownerId: "",
    isHome: false,
    sectorX: destination.sector.x,
    sectorY: destination.sector.y,
    sectorZ: destination.sector.z,
    name: destinationSystemDisplayName(destination, locale),
    seed: destination.seed,
    renameCount: destination.renameCount,
    planets,
  };
}
