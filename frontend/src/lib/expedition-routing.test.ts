import { describe, expect, it } from "vitest";
import { formatLaunchExpeditionErrorMessage } from "@shared/types/expeditions";
import { buildExpeditionPreview } from "./expedition-routing";

describe("expedition route preview", () => {
  it("matches backend Jump Gate scout distance, ETA, fuel, and jump fuel", () => {
    const preview = buildExpeditionPreview({
      routeMode: "jump_gate",
      originSector: { x: 0, y: 0 },
      targetSector: { x: 6, y: 8 },
      jumpGateRouteDistance: 12,
      hasTargetPlanet: false,
      isColonizer: false,
      fuelConsumption: 0.3,
      speed: 2,
    });

    expect(preview.distance).toBe(12);
    expect(preview.etaSeconds).toBe(360);
    expect(preview.fuelRequired).toBe(8);
    expect(preview.jumpFuelRequired).toBe(100);
    expect(preview.returnTrip).toBe(true);
  });

  it("keeps colonizer deployment one-way for selected target planets", () => {
    const preview = buildExpeditionPreview({
      routeMode: "jump_gate",
      originSector: { x: 0, y: 0 },
      targetSector: { x: 3, y: 4 },
      hasTargetPlanet: true,
      isColonizer: true,
      fuelConsumption: 1.5,
      speed: 1,
    });

    expect(preview.distance).toBe(5);
    expect(preview.etaSeconds).toBe(300);
    expect(preview.fuelRequired).toBe(8);
    expect(preview.jumpFuelRequired).toBe(50);
    expect(preview.returnTrip).toBe(false);
  });

  it("deploys combat ships one-way when targeting a planet", () => {
    const preview = buildExpeditionPreview({
      routeMode: "local",
      originSector: { x: 0, y: 0 },
      targetSector: { x: 3, y: 4 },
      hasTargetPlanet: true,
      isColonizer: false,
      shipRole: "combat",
      fuelConsumption: 0.5,
      speed: 2,
    });

    expect(preview.returnTrip).toBe(false);
    // distance = 5, one-way fuel = ceil(5 * 0.5) = 3 (vs 5 round-trip)
    expect(preview.fuelRequired).toBe(3);
  });

  it("deploys the refueler one-way when sent to a target planet", () => {
    const preview = buildExpeditionPreview({
      routeMode: "local",
      originSector: { x: 0, y: 0 },
      targetSector: { x: 3, y: 4 },
      hasTargetPlanet: true,
      isColonizer: false,
      shipRole: "support",
      fuelConsumption: 1.0,
      speed: 1,
    });

    expect(preview.returnTrip).toBe(false);
    expect(preview.fuelRequired).toBe(5);
  });

  it("deploys combat ships one-way when launched at a tactical point", () => {
    const preview = buildExpeditionPreview({
      routeMode: "local",
      originSector: { x: 0, y: 0 },
      targetSector: { x: 3, y: 4 },
      hasTargetPlanet: false,
      isColonizer: false,
      shipRole: "combat",
      fuelConsumption: 0.5,
      speed: 2,
    });

    expect(preview.returnTrip).toBe(false);
    expect(preview.fuelRequired).toBe(3);
  });

  it("deploys combat ships one-way through Jump Gate routes even without a planet target", () => {
    const preview = buildExpeditionPreview({
      routeMode: "jump_gate",
      originSector: { x: 0, y: 0 },
      targetSector: { x: 3, y: 4 },
      jumpGateRouteDistance: 6,
      hasTargetPlanet: false,
      isColonizer: false,
      shipRole: "combat",
      fuelConsumption: 0.5,
      speed: 2,
    });

    expect(preview.returnTrip).toBe(false);
    expect(preview.fuelRequired).toBe(3);
    expect(preview.jumpFuelRequired).toBe(50);
  });

  it("lets stationed ships move inside the same opened system without another Jump Fuel charge", () => {
    const preview = buildExpeditionPreview({
      routeMode: "jump_gate",
      originSector: { x: 3, y: 4 },
      targetSector: { x: 3, y: 4 },
      jumpGateRouteDistance: 7,
      jumpFuelRequiredOverride: 0,
      hasTargetPlanet: false,
      isColonizer: false,
      shipRole: "combat",
      fuelConsumption: 0.5,
      speed: 2,
    });

    expect(preview.returnTrip).toBe(false);
    expect(preview.distance).toBe(7);
    expect(preview.fuelRequired).toBe(4);
    expect(preview.jumpFuelRequired).toBe(0);
  });

  it("keeps scouts round-trip even when targeting a planet", () => {
    const preview = buildExpeditionPreview({
      routeMode: "local",
      originSector: { x: 0, y: 0 },
      targetSector: { x: 3, y: 4 },
      hasTargetPlanet: true,
      isColonizer: false,
      shipRole: "recon",
      fuelConsumption: 0.3,
      speed: 2,
    });

    expect(preview.returnTrip).toBe(true);
  });

  it("formats launch blockers with localized ship and resource names", () => {
    const logistics = formatLaunchExpeditionErrorMessage(
      {
        code: "expedition_logistics_route_required",
        shipTypeId: "cargo_light",
      },
      "en",
    );
    const jumpFuel = formatLaunchExpeditionErrorMessage(
      {
        code: "insufficient_resource",
        resourceId: "jump_fuel",
        required: 50,
        available: 0,
      },
      "ru",
    );

    expect(logistics).toBe("Lightweight Transporter uses cargo transfer.");
    expect(logistics).not.toContain("cargo_light");
    expect(jumpFuel).toBe("Не хватает ресурса: Прыжковое топливо.");
    expect(jumpFuel).not.toContain("jump_fuel");
  });
});
