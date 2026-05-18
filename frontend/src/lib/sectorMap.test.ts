import { describe, expect, it } from "vitest";
import type { SectorPresenceEntity } from "@shared/types/multiplayer";
import {
  hasLiveSectorActivity,
  isUnknownSectorEntity,
  sectorEntityKey,
  sectorEntityDisplay,
  summarizeSectorEntities,
} from "./sectorMap";

const t = (key: string, params?: Record<string, string | number>) => {
  const dictionary: Record<string, string> = {
    "sector.entity.foreignSource": "Masked source: {source}",
    "sector.entity.foreignSourceUnknown": "Masked source hidden",
    "sector.entity.unknownColony": "Unknown colony",
    "sector.entity.unknownContact": "Unknown contact",
    "sector.entity.unknownFleet": "Unknown fleet",
    "sector.relation.foreign": "Foreign",
    "sector.relation.public": "Neutral",
    "sector.relation.self": "Local",
    "sector.type.colony": "Colony",
    "sector.type.fleet": "Fleet",
    "sector.type.home": "Home",
    "sector.type.public_sector": "System",
    "sector.visibility.full": "Full",
    "sector.visibility.fullNote": "Full details available",
    "sector.visibility.publicNote": "Public system signature only",
    "sector.visibility.summary": "Summary",
    "sector.visibility.summaryNote": "Hidden details redacted",
  };

  const template = dictionary[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, param: string) =>
    String(params?.[param] ?? ""),
  );
};

function entity(input: Partial<SectorPresenceEntity>): SectorPresenceEntity {
  return {
    kind: "neutral_system",
    entityType: "public_sector",
    relation: "public",
    systemId: "system-1",
    title: "Open Nexus",
    visibility: "summary",
    worldPosition: { x: 10, y: 20, z: 30 },
    ...input,
  };
}

describe("sector map UI helpers", () => {
  it("counts local, neutral, foreign, and hidden-summary contacts", () => {
    const summary = summarizeSectorEntities([
      entity({ relation: "self", entityType: "home", visibility: "full" }),
      entity({
        relation: "public",
        entityType: "public_sector",
        visibility: "summary",
      }),
      entity({
        relation: "foreign",
        entityType: "colony",
        visibility: "summary",
      }),
      entity({
        relation: "foreign",
        entityType: "fleet",
        visibility: "summary",
      }),
    ]);

    expect(summary.total).toBe(4);
    expect(summary.relation.self).toBe(1);
    expect(summary.relation.public).toBe(1);
    expect(summary.relation.foreign).toBe(2);
    expect(summary.type.fleet).toBe(1);
    expect(summary.hiddenSummary).toBe(2);
  });

  it("redacts backend titles for unknown foreign summary contacts", () => {
    const foreignFleet = entity({
      kind: "foreign_ship",
      entityType: "fleet",
      relation: "foreign",
      shipId: "ship-secret-id",
      title: "Ship · stealth_scout",
      subtitle: "@rival",
      visibility: "summary",
    });

    const display = sectorEntityDisplay(foreignFleet, t);

    expect(isUnknownSectorEntity(foreignFleet)).toBe(true);
    expect(display.title).toBe("Unknown fleet");
    expect(display.subtitle).toBe("Masked source: @rival");
    expect(display.title).not.toContain("stealth_scout");
    expect(display.title).not.toContain("ship-secret-id");
    expect(display.privacyNote).toBe("Hidden details redacted");
  });

  it("keeps full local contact titles visible", () => {
    const ownColony = entity({
      kind: "own_colony",
      entityType: "colony",
      relation: "self",
      planetId: "planet-owned-id",
      title: "Settlement Prime",
      visibility: "full",
    });

    const display = sectorEntityDisplay(ownColony, t);

    expect(isUnknownSectorEntity(ownColony)).toBe(false);
    expect(display.title).toBe("Settlement Prime");
    expect(display.visibilityLabel).toBe("Full");
    expect(display.privacyNote).toBe("Full details available");
  });

  it("keeps moving ship keys stable across position updates", () => {
    const first = entity({
      kind: "own_ship",
      entityType: "fleet",
      relation: "self",
      systemId: "system-a",
      shipId: "ship-a",
      visibility: "full",
      worldPosition: { x: 10, y: 20, z: 0 },
    });
    const second = {
      ...first,
      worldPosition: { x: 12.5, y: 24, z: 0 },
      motion: {
        state: "moving" as const,
        dx: 2.5,
        dy: 4,
        updatedAt: "2026-05-18T10:00:00.000Z",
      },
    };

    expect(sectorEntityKey(second)).toBe(sectorEntityKey(first));
  });

  it("detects moving and recent-combat sector activity for polling", () => {
    expect(
      hasLiveSectorActivity(
        { entities: [entity({})] },
        Date.parse("2026-05-18T10:00:00.000Z"),
      ),
    ).toBe(false);
    expect(
      hasLiveSectorActivity({
        entities: [
          entity({
            kind: "foreign_ship",
            entityType: "fleet",
            relation: "foreign",
            motion: {
              state: "moving",
              dx: 1,
              dy: 0,
              updatedAt: "2026-05-18T10:00:00.000Z",
            },
          }),
        ],
      }),
    ).toBe(true);
    expect(
      hasLiveSectorActivity(
        {
          entities: [
            entity({
              kind: "foreign_ship",
              entityType: "fleet",
              relation: "foreign",
              lastCombatTickAt: "2026-05-18T09:59:45.000Z",
            }),
          ],
        },
        Date.parse("2026-05-18T10:00:00.000Z"),
      ),
    ).toBe(true);
  });
});
