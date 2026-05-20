import { describe, expect, it } from "vitest";

import {
  MAX_BUILDING_LEVEL,
  HIGH_TIER_UPGRADE_COSTS_BY_BUILDING,
} from "@shared/config/buildingUpgradeEconomy.js";
import { JUMP_GATE_JUMP_FUEL_COST } from "@shared/config/expeditionRouting.js";
import { EXTRACTABLE_RESOURCE_RATES_PER_HOUR } from "@shared/config/resourceExtractionRates.js";
import { PRODUCTION_RECIPES } from "@shared/config/productionRecipes.js";
import {
  ADVANCED_COMMON_POOL_RESOURCE_IDS,
  RADIOACTIVE_RESOURCE_IDS,
} from "@shared/types/resources.js";
import { runCatalogAudit } from "./audit.js";
import {
  BUILDING_TYPE_CATALOG_ROWS,
  RESOURCE_CATALOG_ROWS,
  SHIP_TYPE_CATALOG_ROWS,
} from "./catalog-rows.js";

describe("catalog seed audit (P2-POL-002)", () => {
  it("passes without drift across resources, buildings, ships, research, and production recipes", () => {
    const result = runCatalogAudit();
    expect(result.errors, result.errors.join("\n")).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("keeps building caps and extraction rates aligned with shared balance constants", () => {
    expect(
      BUILDING_TYPE_CATALOG_ROWS.every(
        (row) => row.maxLevel === MAX_BUILDING_LEVEL,
      ),
    ).toBe(true);

    const resourceRates = new Map(
      RESOURCE_CATALOG_ROWS.map((row) => [row.id, row.baseRegenRate]),
    );
    expect(resourceRates.get("iron")).toBe(
      EXTRACTABLE_RESOURCE_RATES_PER_HOUR.iron,
    );
    expect(resourceRates.get("silicon")).toBe(
      EXTRACTABLE_RESOURCE_RATES_PER_HOUR.silicon,
    );
    expect(resourceRates.get("oxygen")).toBe(
      EXTRACTABLE_RESOURCE_RATES_PER_HOUR.oxygen,
    );
    expect(resourceRates.get("hydrogen")).toBe(
      EXTRACTABLE_RESOURCE_RATES_PER_HOUR.hydrogen,
    );
    expect(resourceRates.get("nitrogen")).toBe(
      EXTRACTABLE_RESOURCE_RATES_PER_HOUR.nitrogen,
    );
    expect(resourceRates.get("silver")).toBe(
      EXTRACTABLE_RESOURCE_RATES_PER_HOUR.silver,
    );
    expect(resourceRates.get("gold")).toBe(
      EXTRACTABLE_RESOURCE_RATES_PER_HOUR.gold,
    );
    expect(resourceRates.get("iron")).toBeGreaterThan(
      resourceRates.get("silicon") ?? 0,
    );
  });

  it("keeps P2.2-015 extractor catalog defaults aligned with new deposit roles", () => {
    const drill = BUILDING_TYPE_CATALOG_ROWS.find(
      (building) => building.id === "drill",
    );
    const oilPump = BUILDING_TYPE_CATALOG_ROWS.find(
      (building) => building.id === "oil_pump",
    );
    const bioreactor = BUILDING_TYPE_CATALOG_ROWS.find(
      (building) => building.id === "biomass_harvester",
    );

    expect(drill).toBeDefined();
    expect(oilPump).toBeDefined();
    expect(bioreactor).toBeDefined();
    expect(drill!.name.en).toBe("Gas Extractor");
    expect(drill!.baseOutput).toMatchObject({ resourceId: "methane" });
    expect(oilPump!.description!.en).toContain("oil or methane");
    expect(bioreactor!.name.en).toBe("Bioreactor");
    expect(bioreactor!.description!.en).toContain("water");
  });

  it("keeps player-facing catalog names and descriptions free of task or implementation metadata", () => {
    const metaPattern =
      /\b(P\d(?:\.\d)?-\d+|task-id|task|slug|proxy|server|internal|technical)\b/i;
    const texts = [
      ...RESOURCE_CATALOG_ROWS.flatMap((row) => [row.name.en, row.name.ru]),
      ...BUILDING_TYPE_CATALOG_ROWS.flatMap((row) => [
        row.name.en,
        row.name.ru,
        row.description?.en ?? "",
        row.description?.ru ?? "",
      ]),
      ...SHIP_TYPE_CATALOG_ROWS.flatMap((row) => [row.name.en, row.name.ru]),
    ];

    for (const text of texts) {
      expect(text).not.toMatch(metaPattern);
    }
  });

  it("keeps high-tier ship infrastructure costs realistic", () => {
    expect(HIGH_TIER_UPGRADE_COSTS_BY_BUILDING.spaceport).toMatchObject({
      aluminum: expect.any(Number),
      steel: expect.any(Number),
      titanium: expect.any(Number),
    });
    expect(HIGH_TIER_UPGRADE_COSTS_BY_BUILDING.spaceport).not.toHaveProperty(
      "biomass",
    );
    expect(HIGH_TIER_UPGRADE_COSTS_BY_BUILDING.shipyard).not.toHaveProperty(
      "biomass",
    );
  });

  it("keeps silicon carbide as an expensive manufactured material", () => {
    const recipe = PRODUCTION_RECIPES.find(
      (row) => row.id === "silicon_carbide_from_silicon_carbon",
    );
    const resource = RESOURCE_CATALOG_ROWS.find(
      (row) => row.id === "silicon_carbide",
    );

    expect(resource?.baseRegenRate).toBe(0);
    expect(recipe).toBeDefined();
    expect(recipe!.buildingTypeId).toBe("fabrication_bay");
    expect(recipe!.output).toEqual({
      resourceId: "silicon_carbide",
      amount: 1,
    });
    expect(recipe!.inputs).toEqual([
      { resourceId: "silicon", amount: 24 },
      { resourceId: "carbon", amount: 16 },
      { resourceId: "steel", amount: 2 },
    ]);
    expect(recipe!.baseDurationSec).toBeGreaterThanOrEqual(180);
  });

  it("unlocks the shipyard after a level 1 spaceport", () => {
    const shipyard = BUILDING_TYPE_CATALOG_ROWS.find(
      (building) => building.id === "shipyard",
    );
    expect(shipyard).toBeDefined();
    expect(shipyard!.deps).toEqual([{ typeId: "spaceport", level: 1 }]);
  });

  it("keeps cargo_light aligned with P2.2 lightweight transporter balance", () => {
    const cargoLight = SHIP_TYPE_CATALOG_ROWS.find(
      (ship) => ship.id === "cargo_light",
    );
    expect(cargoLight).toBeDefined();
    expect(cargoLight!.cargo).toBe(5000);
    expect(cargoLight!.requiredBuildings).toEqual([
      { typeId: "shipyard", level: 2 },
    ]);
    expect(cargoLight!.buildCost).not.toHaveProperty("aluminum");
    expect(cargoLight!.buildCost).not.toHaveProperty("electronics");
    expect(Object.keys(cargoLight!.buildCost)).toEqual([
      "iron",
      "silicon",
      "carbon",
      "methane",
    ]);
  });

  it("keeps active ship catalog ids aligned with Jump Gate semantics", () => {
    expect(SHIP_TYPE_CATALOG_ROWS.map((ship) => ship.id)).toEqual([
      "scout",
      "cargo_light",
      "colonizer",
      "recon_probe",
      "refueler",
      "light_fighter",
      "light_bomber",
      "light_laser",
      "small_shield_ship",
      "medium_fighter",
      "medium_bomber",
      "medium_laser",
      "medium_shield_ship",
      "heavy_fighter",
      "heavy_bomber",
      "heavy_laser",
      "large_shield_ship",
      "rocket_carrier",
      "heavy_rocket_carrier",
      "nuclear_carrier",
    ]);
    const reconProbe = SHIP_TYPE_CATALOG_ROWS.find(
      (ship) => ship.id === "recon_probe",
    );
    expect(reconProbe).toBeDefined();
    expect(reconProbe!.name).toMatchObject({
      en: "Recon Probe",
      ru: "Разведывательный зонд",
    });
    expect(reconProbe!.role).toBe("exploration");
    expect(reconProbe!.cargo).toBe(0);
    expect(reconProbe!.jumpFuelCapacity).toBeGreaterThanOrEqual(
      JUMP_GATE_JUMP_FUEL_COST,
    );
  });

  it("keeps refueler support reserve separate from ship tanks", () => {
    const refueler = SHIP_TYPE_CATALOG_ROWS.find(
      (ship) => ship.id === "refueler",
    );
    expect(refueler).toBeDefined();
    expect(refueler!.role).toBe("support");
    expect(refueler!.cargo).toBe(0);
    expect(refueler!.fuelCapacity).toBeGreaterThan(0);
    expect(refueler!.jumpFuelCapacity).toBeGreaterThanOrEqual(
      JUMP_GATE_JUMP_FUEL_COST,
    );
    expect(refueler!.refuelFuelCapacity).toBe(2000);
    expect(refueler!.refuelJumpFuelCapacity).toBeGreaterThanOrEqual(
      JUMP_GATE_JUMP_FUEL_COST,
    );
  });

  it("keeps military weapon ranges explicit and fighter-scaled", () => {
    const byId = new Map(SHIP_TYPE_CATALOG_ROWS.map((ship) => [ship.id, ship]));

    expect(byId.get("light_fighter")!.combatStats).toMatchObject({
      engagementRange: "close",
    });
    expect(byId.get("medium_fighter")!.combatStats).toMatchObject({
      engagementRange: "medium",
    });
    expect(byId.get("heavy_fighter")!.combatStats).toMatchObject({
      engagementRange: "medium",
    });
    expect(byId.get("light_laser")!.combatStats).toMatchObject({
      engagementRange: "long",
    });
    expect(byId.get("medium_laser")!.combatStats).toMatchObject({
      engagementRange: "long",
    });
    expect(byId.get("heavy_laser")!.combatStats).toMatchObject({
      engagementRange: "long",
    });
    expect(
      byId.get("rocket_carrier")!.combatStats?.missilePayload,
    ).toMatchObject({
      maxRange: "long",
    });
    expect(
      byId.get("heavy_rocket_carrier")!.combatStats?.missilePayload,
    ).toMatchObject({
      maxRange: "long",
    });
    expect(byId.get("light_bomber")!.combatStats).toMatchObject({
      engagementRange: "orbital",
      bombardmentRange: "close",
    });
    expect(byId.get("medium_bomber")!.combatStats).toMatchObject({
      engagementRange: "orbital",
      bombardmentRange: "medium",
    });
    expect(byId.get("heavy_bomber")!.combatStats).toMatchObject({
      engagementRange: "orbital",
      bombardmentRange: "medium",
    });
    expect(byId.get("nuclear_carrier")!.combatStats).toMatchObject({
      engagementRange: "orbital",
      bombardmentRange: "long",
    });
  });

  it("keeps advanced combat hulls gated by military shipyard and Common Pool materials", () => {
    const byId = new Map(SHIP_TYPE_CATALOG_ROWS.map((ship) => [ship.id, ship]));
    const mediumIds = ["medium_fighter", "medium_bomber", "medium_laser"];
    const heavyIds = ["heavy_fighter", "heavy_bomber", "heavy_laser"];
    const shieldIds = [
      "small_shield_ship",
      "medium_shield_ship",
      "large_shield_ship",
    ];

    for (const id of mediumIds) {
      const ship = byId.get(id);
      expect(ship, id).toBeDefined();
      expect(ship!.requiredBuildings).toEqual([
        { typeId: "military_shipyard", level: 3 },
      ]);
      expect(Object.keys(ship!.buildCost)).toEqual(
        expect.arrayContaining(["steel", "electronics"]),
      );
    }

    for (const id of heavyIds) {
      const ship = byId.get(id);
      expect(ship, id).toBeDefined();
      expect(ship!.requiredBuildings).toEqual([
        { typeId: "military_shipyard", level: 5 },
      ]);
      expect(Object.keys(ship!.buildCost)).toEqual(
        expect.arrayContaining(["steel", "electronics", "jump_fuel"]),
      );
    }

    expect(byId.get("medium_laser")!.buildCost).toHaveProperty("cobalt");
    expect(byId.get("heavy_bomber")!.buildCost).toHaveProperty("iridium");
    expect(byId.get("heavy_rocket_carrier")!.buildCost).toHaveProperty(
      "antimatter",
    );

    for (const id of shieldIds) {
      const ship = byId.get(id);
      expect(ship, id).toBeDefined();
      expect(ship!.role).toBe("shield");
      const shield = ship!.combatStats!.shields!;
      expect(shield.capacity).toBeGreaterThan(0);
      expect(shield.radius).toBeGreaterThan(0);
      expect(Object.keys(ship!.buildCost)).toEqual(
        expect.arrayContaining(["steel", "electronics"]),
      );
    }
  });

  it("keeps advanced Common Pool and atomic power content abstract and reachable", () => {
    const resourceIds = new Set(RESOURCE_CATALOG_ROWS.map((row) => row.id));
    for (const resourceId of ADVANCED_COMMON_POOL_RESOURCE_IDS) {
      expect(resourceIds.has(resourceId)).toBe(true);
    }

    const reactor = BUILDING_TYPE_CATALOG_ROWS.find(
      (building) => building.id === "atomic_reactor",
    );
    expect(reactor).toBeDefined();
    expect(reactor!.maxPerPlanet).toBe(1);
    expect(reactor!.deps).toEqual([
      { typeId: "command_center", level: 5 },
      { typeId: "battery", level: 2 },
    ]);

    const recipes = PRODUCTION_RECIPES.filter(
      (recipe) => recipe.buildingTypeId === "atomic_reactor",
    );
    expect(recipes.map((recipe) => recipe.id).sort()).toEqual([
      "energy_from_tritium_cell",
      "energy_from_uranium_cell",
    ]);
    for (const recipe of recipes) {
      expect(recipe.output.resourceId).toBe("energy");
      expect(recipe.output.amount).toBeGreaterThan(500);
      expect(
        recipe.inputs.some((input) =>
          (RADIOACTIVE_RESOURCE_IDS as readonly string[]).includes(
            input.resourceId,
          ),
        ),
      ).toBe(true);
    }

    const forbidden =
      /\b(enrichment|centrifuge|warhead|detonation|assembly|isotope|fission|fusion)\b/i;
    const playerFacingTexts = [
      reactor!.name.en,
      reactor!.name.ru,
      reactor!.description!.en,
      reactor!.description!.ru,
      ...recipes.flatMap((recipe) => [
        recipe.name.en,
        recipe.name.ru,
        recipe.description.en,
        recipe.description.ru,
      ]),
    ];
    for (const text of playerFacingTexts) {
      expect(text).not.toMatch(forbidden);
    }
  });

  it("keeps rocket carriers as limited missile-payload hulls", () => {
    const rocket = SHIP_TYPE_CATALOG_ROWS.find(
      (ship) => ship.id === "rocket_carrier",
    );
    const heavyRocket = SHIP_TYPE_CATALOG_ROWS.find(
      (ship) => ship.id === "heavy_rocket_carrier",
    );

    expect(rocket).toBeDefined();
    expect(heavyRocket).toBeDefined();
    expect(rocket!.role).toBe("missile");
    expect(heavyRocket!.role).toBe("missile");
    const rocketPayload = rocket!.combatStats!.missilePayload!;
    const heavyRocketPayload = heavyRocket!.combatStats!.missilePayload!;
    expect(rocketPayload).toMatchObject({
      alphaDamage: 1500,
      validTargetClasses: ["military_medium", "military_heavy"],
      evasionCounterThreshold: 0.3,
      maxRange: "long",
    });
    expect(heavyRocketPayload).toMatchObject({
      validTargetClasses: ["military_medium", "military_heavy"],
      evasionCounterThreshold: 0.25,
      maxRange: "long",
    });
    expect(rocketPayload.validTargetClasses).not.toContain("civilian");
    expect(rocketPayload.validTargetClasses).not.toContain("military_light");
  });
});
