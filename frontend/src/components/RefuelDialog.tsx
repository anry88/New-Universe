import React, { useMemo, useState } from "react";
import { Droplets, Fuel, Target, X, Zap } from "lucide-react";
import { JUMP_FUEL_RESOURCE_ID } from "@shared/config/expeditionRouting";
import { systemMapPlanetDistanceLy } from "@shared/format/systemMapLayout";
import type { Ship, ShipType } from "@shared/types/ships";
import type { HomeSystem, Planet } from "@shared/types/world";
import { useRefuel, useRefuelReplenish } from "../hooks/useShips";
import { buildExpeditionPreview } from "../lib/expedition-routing";
import { useI18n } from "../lib/i18n";
import { isShipReadyForOrders } from "../lib/ship-queue";
import { CosmicBackground } from "./cosmic/atoms";
import { CosmicSystemRenderer } from "./cosmic/SystemMap";
import { getShipLabel, ShipIconBadge } from "./cosmic/ships";
import { ResourceAmount } from "./cosmic/resources";

type RefuelMode = "transfer" | "replenish";

interface RefuelDialogProps {
  sourceShip: Ship;
  sourceType: ShipType;
  sourcePlanet?: Planet | null;
  system: HomeSystem;
  planets: Planet[];
  allShips: Ship[];
  allShipTypes: ShipType[];
  initialTargetShipId?: string;
  initialMode?: RefuelMode;
  onClose: () => void;
}

function resourceAmount(planet: Planet | null | undefined, resourceId: string) {
  return Math.floor(
    Number(
      planet?.resources?.find((resource) => resource.resourceId === resourceId)
        ?.amount ?? 0,
    ),
  );
}

function routeDistance(
  system: HomeSystem,
  sourcePlanetId: string | null,
  targetPlanetId: string | null,
) {
  if (!sourcePlanetId || !targetPlanetId) return null;
  return (
    systemMapPlanetDistanceLy(
      system.planets ?? [],
      Number(system.seed),
      sourcePlanetId,
      targetPlanetId,
    ) ?? 0
  );
}

export function RefuelDialog({
  sourceShip,
  sourceType,
  sourcePlanet,
  system,
  planets,
  allShips,
  allShipTypes,
  initialTargetShipId,
  initialMode = "transfer",
  onClose,
}: RefuelDialogProps) {
  const { t, locale } = useI18n();
  const refuel = useRefuel();
  const replenish = useRefuelReplenish();
  const [mode, setMode] = useState<RefuelMode>(initialMode);
  const [targetShipId, setTargetShipId] = useState(initialTargetShipId ?? "");
  const [targetPlanetId, setTargetPlanetId] = useState("");
  const [fuelAmount, setFuelAmount] = useState(0);
  const [jumpFuelAmount, setJumpFuelAmount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const planetIdsInSystem = useMemo(
    () => new Set((system.planets ?? []).map((planet) => planet.id)),
    [system.planets],
  );
  const ownedPlanetIds = useMemo(
    () =>
      new Set(
        planets
          .filter((planet) => planet.isColonized !== false)
          .map((planet) => planet.id),
      ),
    [planets],
  );
  const planetById = useMemo(
    () => new Map(planets.map((planet) => [planet.id, planet])),
    [planets],
  );
  const typeById = useMemo(
    () => new Map(allShipTypes.map((shipType) => [shipType.id, shipType])),
    [allShipTypes],
  );

  const mapShips = useMemo(
    () =>
      allShips.filter(
        (ship) =>
          ship.id === sourceShip.id ||
          (ship.locationPlanetId != null &&
            planetIdsInSystem.has(ship.locationPlanetId)),
      ),
    [allShips, planetIdsInSystem, sourceShip.id],
  );

  const targetCandidates = useMemo(
    () =>
      allShips.filter(
        (ship) =>
          ship.id !== sourceShip.id &&
          ship.status !== "destroyed" &&
          isShipReadyForOrders(ship) &&
          ship.locationPlanetId != null &&
          planetIdsInSystem.has(ship.locationPlanetId),
      ),
    [allShips, planetIdsInSystem, sourceShip.id],
  );
  const targetCandidateIds = useMemo(
    () => new Set(targetCandidates.map((ship) => ship.id)),
    [targetCandidates],
  );

  const targetShip =
    targetCandidates.find((ship) => ship.id === targetShipId) ?? null;
  const targetType = targetShip
    ? (typeById.get(targetShip.typeId) ?? null)
    : null;
  const selectedReplenishPlanet =
    planets.find((planet) => planet.id === targetPlanetId) ?? null;
  const activeTargetPlanetId =
    mode === "transfer"
      ? (targetShip?.locationPlanetId ?? null)
      : targetPlanetId;
  const activeTargetPlanet = activeTargetPlanetId
    ? (planetById.get(activeTargetPlanetId) ?? null)
    : null;

  const sameSystemDistance = routeDistance(
    system,
    sourceShip.locationPlanetId,
    activeTargetPlanetId,
  );
  const routePreview =
    activeTargetPlanetId && sameSystemDistance !== null
      ? buildExpeditionPreview({
          routeMode: "local",
          originSector: { x: system.sectorX, y: system.sectorY },
          targetSector: { x: system.sectorX, y: system.sectorY },
          sameSystemPlanetDistance: sameSystemDistance,
          hasTargetPlanet: true,
          isColonizer: false,
          shipRole: sourceType.role,
          fuelConsumption: Number(sourceType.fuelConsumption),
          speed: Number(sourceType.speed),
        })
      : null;
  const travelFuelRequired = routePreview?.fuelRequired ?? 0;
  const sourcePlanetFuel = resourceAmount(sourcePlanet, "fuel");
  const sourcePlanetJumpFuel = resourceAmount(
    sourcePlanet,
    JUMP_FUEL_RESOURCE_ID,
  );
  const sourceRefuelFuel = Number(sourceShip.refuelFuel ?? 0);
  const sourceRefuelJumpFuel = Number(sourceShip.refuelJumpFuel ?? 0);
  const sourceOwnFuel = Number(sourceShip.fuel ?? 0);
  const sourceOwnJumpFuel = Number(sourceShip.jumpFuel ?? 0);
  const sourcePlanetFuelAfterTravel = Math.max(
    0,
    sourcePlanetFuel - Math.max(0, travelFuelRequired - sourceOwnFuel),
  );
  const canPayTravelFuel =
    sourceOwnFuel + sourcePlanetFuel >= travelFuelRequired;
  const sourceFuelTransferAvailable =
    sourceRefuelFuel +
    Math.min(
      Math.max(0, sourceType.refuelFuelCapacity - sourceRefuelFuel),
      sourcePlanetFuelAfterTravel,
    );
  const sourceJumpFuelTransferAvailable =
    sourceRefuelJumpFuel +
    Math.min(
      Math.max(0, sourceType.refuelJumpFuelCapacity - sourceRefuelJumpFuel),
      sourcePlanetJumpFuel,
    );
  const maxFuel = Math.floor(
    Math.max(
      0,
      Math.min(
        sourceFuelTransferAvailable,
        targetType
          ? targetType.fuelCapacity - Number(targetShip?.fuel ?? 0)
          : 0,
      ),
    ),
  );
  const maxJumpFuel = Math.floor(
    Math.max(
      0,
      Math.min(
        sourceJumpFuelTransferAvailable,
        targetType
          ? targetType.jumpFuelCapacity - Number(targetShip?.jumpFuel ?? 0)
          : 0,
      ),
    ),
  );
  const clampedFuelAmount = Math.min(maxFuel, Math.max(0, fuelAmount));
  const clampedJumpFuelAmount = Math.min(
    maxJumpFuel,
    Math.max(0, jumpFuelAmount),
  );
  const isBusy = refuel.isPending || replenish.isPending;
  const canTransfer =
    mode === "transfer" &&
    targetShip &&
    (clampedFuelAmount > 0 || clampedJumpFuelAmount > 0) &&
    canPayTravelFuel &&
    !isBusy;
  const canReplenish =
    mode === "replenish" &&
    selectedReplenishPlanet &&
    ownedPlanetIds.has(selectedReplenishPlanet.id) &&
    canPayTravelFuel &&
    !isBusy;

  const resetSelectionForMode = (nextMode: RefuelMode) => {
    setMode(nextMode);
    setError(null);
    setFuelAmount(0);
    setJumpFuelAmount(0);
  };

  const handleTransfer = async () => {
    if (!targetShip) return;
    try {
      setError(null);
      await refuel.mutateAsync({
        targetShipId: targetShip.id,
        sourceShipId: sourceShip.id,
        fuel: clampedFuelAmount,
        jumpFuel: clampedJumpFuelAmount,
      });
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message || t("refuel.error.generic"));
    }
  };

  const handleReplenish = async () => {
    if (!selectedReplenishPlanet) return;
    try {
      setError(null);
      await replenish.mutateAsync({
        sourceShipId: sourceShip.id,
        targetPlanetId: selectedReplenishPlanet.id,
      });
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message || t("refuel.error.generic"));
    }
  };

  return (
    <div className="animate-in fade-in duration-200 refuel-map-shell">
      <div className="refuel-map-head">
        <div className="refuel-map-title">
          <ShipIconBadge
            typeId={sourceShip.typeId}
            status={sourceShip.status}
            size={34}
            title={sourceType.name[locale]}
          />
          <div>
            <div className="refuel-map-kicker">
              {t("refuel_dialog_source").toUpperCase()}
            </div>
            <div className="refuel-map-name">{sourceType.name[locale]}</div>
          </div>
        </div>
        <button
          type="button"
          className="refuel-map-close"
          aria-label={t("common.close")}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>

      <div className="refuel-mode-tabs">
        <button
          type="button"
          className={mode === "transfer" ? "active" : ""}
          onClick={() => resetSelectionForMode("transfer")}
        >
          <Fuel size={15} />
          {t("refuel_dialog_transfer_button")}
        </button>
        <button
          type="button"
          className={mode === "replenish" ? "active" : ""}
          onClick={() => resetSelectionForMode("replenish")}
        >
          <Droplets size={15} />
          {t("refuel.replenish.button")}
        </button>
      </div>

      <div className="refuel-map-frame">
        <CosmicBackground accent="#5BD7FF" starSeed={17} />
        <CosmicSystemRenderer
          system={system}
          ships={mapShips}
          shipTypes={allShipTypes}
          expeditions={[]}
          onPlanetClick={(planet) => {
            if (mode !== "replenish") return;
            if (!ownedPlanetIds.has(planet.id)) return;
            setTargetPlanetId(planet.id);
            setError(null);
          }}
          ownedPlanetIds={ownedPlanetIds}
          showOrbitRings={true}
          onOwnShipAction={(ship) => {
            if (mode !== "transfer") return;
            if (!targetCandidateIds.has(ship.id)) return;
            setTargetShipId(ship.id);
            setFuelAmount(0);
            setJumpFuelAmount(0);
            setError(null);
          }}
          ownShipActionOverride={({ ship }) => {
            if (mode !== "transfer") return null;
            const selectable = targetCandidateIds.has(ship.id);
            return {
              label:
                ship.id === sourceShip.id
                  ? t("refuel.map.sourceSelected")
                  : t("refuel.map.selectTarget"),
              icon: <Target size={14} />,
              disabled: !selectable,
            };
          }}
          planetActionOverride={({ planet, isOwnedPlanet }) => {
            if (mode !== "replenish") return null;
            return {
              label: isOwnedPlanet
                ? t("refuel.map.selectPlanet")
                : t("refuel.map.notOwnedPlanet"),
              disabled: !isOwnedPlanet,
            };
          }}
        />
      </div>

      <div className="refuel-map-panel">
        {error ? <div className="refuel-error">{error}</div> : null}

        <div className="refuel-source-grid">
          <div className="refuel-stat">
            <span>{t("refuel_dialog_ship_tanks")}</span>
            <b>
              <ResourceAmount
                resourceId="fuel"
                amount={`${sourceOwnFuel.toFixed(0)} / ${sourceType.fuelCapacity}`}
                iconSize={12}
                locale={locale}
              />
              <ResourceAmount
                resourceId="jump_fuel"
                amount={`${sourceOwnJumpFuel.toFixed(0)} / ${sourceType.jumpFuelCapacity}`}
                iconSize={12}
                locale={locale}
              />
            </b>
          </div>
          <div className="refuel-stat">
            <span>{t("refuel_dialog_reserve")}</span>
            <b>
              <ResourceAmount
                resourceId="fuel"
                amount={`${sourceRefuelFuel.toFixed(0)} / ${sourceType.refuelFuelCapacity}`}
                iconSize={12}
                locale={locale}
              />
              <ResourceAmount
                resourceId="jump_fuel"
                amount={`${sourceRefuelJumpFuel.toFixed(0)} / ${sourceType.refuelJumpFuelCapacity}`}
                iconSize={12}
                locale={locale}
              />
            </b>
          </div>
          <div className="refuel-stat">
            <span>{t("refuel_dialog_planet_stockpile")}</span>
            <b>
              <ResourceAmount
                resourceId="fuel"
                amount={sourcePlanetFuel}
                iconSize={12}
                locale={locale}
              />
              <ResourceAmount
                resourceId="jump_fuel"
                amount={sourcePlanetJumpFuel}
                iconSize={12}
                locale={locale}
              />
            </b>
          </div>
          <div className="refuel-stat">
            <span>{t("refuel.routeFuel")}</span>
            <b>
              <ResourceAmount
                resourceId="fuel"
                amount={travelFuelRequired}
                iconSize={12}
                locale={locale}
              />
            </b>
          </div>
        </div>

        {mode === "transfer" ? (
          <>
            <div className="refuel-selection-summary">
              <span>{t("refuel_dialog_target")}</span>
              <b>
                {targetShip && targetType
                  ? `${targetType.name[locale]} · ${
                      activeTargetPlanet?.name ?? t("common.unknown")
                    }`
                  : t("refuel.map.pickShip")}
              </b>
            </div>
            {targetShip && targetType ? (
              <div className="refuel-target-tanks">
                <ResourceAmount
                  resourceId="fuel"
                  amount={`${Number(targetShip.fuel).toFixed(0)} / ${targetType.fuelCapacity}`}
                  iconSize={12}
                  locale={locale}
                />
                <ResourceAmount
                  resourceId="jump_fuel"
                  amount={`${Number(targetShip.jumpFuel).toFixed(0)} / ${targetType.jumpFuelCapacity}`}
                  iconSize={12}
                  locale={locale}
                />
              </div>
            ) : targetCandidates.length === 0 ? (
              <div className="empty-hint">{t("refuel.no_targets")}</div>
            ) : null}

            {targetShip && targetType ? (
              <div className="refuel-controls">
                <FuelSlider
                  label={t("refuel_dialog_fuel_label")}
                  value={clampedFuelAmount}
                  max={maxFuel}
                  resourceId="fuel"
                  locale={locale}
                  onChange={setFuelAmount}
                />
                <FuelSlider
                  label={t("refuel_dialog_jump_fuel_label")}
                  value={clampedJumpFuelAmount}
                  max={maxJumpFuel}
                  resourceId="jump_fuel"
                  locale={locale}
                  onChange={setJumpFuelAmount}
                />
              </div>
            ) : null}
            {targetShip && !canPayTravelFuel ? (
              <div className="empty-hint">
                {t("expedition.error.notEnoughFuel")}
              </div>
            ) : null}

            <button
              type="button"
              className="cosmic-cta primary"
              disabled={!canTransfer}
              onClick={handleTransfer}
            >
              {isBusy
                ? t("common.loading")
                : t("refuel.launchTransfer").toUpperCase()}
            </button>
          </>
        ) : (
          <>
            <div className="refuel-selection-summary">
              <span>{t("refuel.replenish.targetPlanet")}</span>
              <b>
                {selectedReplenishPlanet
                  ? selectedReplenishPlanet.name
                  : t("refuel.map.pickPlanet")}
              </b>
            </div>
            {selectedReplenishPlanet ? (
              <div className="refuel-target-tanks">
                <ResourceAmount
                  resourceId="fuel"
                  amount={resourceAmount(selectedReplenishPlanet, "fuel")}
                  iconSize={12}
                  locale={locale}
                />
                <ResourceAmount
                  resourceId="jump_fuel"
                  amount={resourceAmount(
                    selectedReplenishPlanet,
                    JUMP_FUEL_RESOURCE_ID,
                  )}
                  iconSize={12}
                  locale={locale}
                />
              </div>
            ) : null}
            {selectedReplenishPlanet && !canPayTravelFuel ? (
              <div className="empty-hint">
                {t("expedition.error.notEnoughFuel")}
              </div>
            ) : null}
            <button
              type="button"
              className="cosmic-cta primary"
              disabled={!canReplenish}
              onClick={handleReplenish}
            >
              {isBusy
                ? t("common.loading")
                : t("refuel.launchReplenish").toUpperCase()}
            </button>
          </>
        )}
      </div>

      <style>{`
        .refuel-map-shell {
          position: fixed;
          inset: 0;
          z-index: 1200;
          display: flex;
          flex-direction: column;
          height: 100dvh;
          max-height: 100dvh;
          overflow: hidden;
          box-sizing: border-box;
          padding: max(10px, env(safe-area-inset-top, 10px)) max(12px, env(safe-area-inset-right, 12px)) max(12px, env(safe-area-inset-bottom, 0px)) max(12px, env(safe-area-inset-left, 12px));
          background: rgba(6, 10, 18, 0.95);
          backdrop-filter: blur(10px);
          color: var(--text);
          --accent: #5BD7FF;
        }
        .refuel-map-head {
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 8px;
        }
        .refuel-map-title {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }
        .refuel-map-kicker {
          font-family: var(--font-mono);
          font-size: 9px;
          letter-spacing: 0.16em;
          color: var(--accent);
        }
        .refuel-map-name {
          font-family: var(--font-display);
          font-size: 17px;
          font-weight: 700;
        }
        .refuel-map-close {
          width: 40px;
          height: 40px;
          display: grid;
          place-items: center;
          border-radius: 999px;
          border: 1px solid var(--line);
          background: rgba(14,20,36,0.86);
          color: var(--text-dim);
        }
        .refuel-mode-tabs {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
          margin-bottom: 8px;
        }
        .refuel-mode-tabs button {
          min-height: 38px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          border: 1px solid var(--line);
          border-radius: 10px;
          background: rgba(8,12,22,0.78);
          color: var(--text-dim);
          font-size: 12px;
          font-weight: 800;
        }
        .refuel-mode-tabs button.active {
          border-color: var(--accent);
          background: rgba(91,215,255,0.16);
          color: var(--accent);
        }
        .refuel-map-frame {
          position: relative;
          flex: 1 1 50%;
          min-height: 190px;
          overflow: hidden;
          border: 1px solid var(--line);
          border-radius: 16px;
        }
        .refuel-map-frame > .cosmic-system-map,
        .refuel-map-frame > :last-child {
          position: absolute;
          inset: 0;
        }
        .refuel-map-panel {
          flex: 0 1 auto;
          max-height: 44%;
          overflow-y: auto;
          margin-top: 10px;
          padding: 12px;
          border: 1px solid var(--line);
          border-radius: 16px;
          background: rgba(10,14,26,0.78);
        }
        .refuel-error {
          margin-bottom: 10px;
          padding: 9px 10px;
          border: 1px solid rgba(248,113,113,0.35);
          border-radius: 10px;
          background: rgba(248,113,113,0.1);
          color: #fecaca;
          font-size: 12px;
          line-height: 1.35;
        }
        .refuel-source-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
          margin-bottom: 10px;
        }
        .refuel-stat,
        .refuel-selection-summary {
          min-width: 0;
          border: 1px solid rgba(148,163,184,0.14);
          border-radius: 10px;
          background: rgba(14,20,36,0.66);
          padding: 8px 9px;
        }
        .refuel-stat span,
        .refuel-selection-summary span {
          display: block;
          margin-bottom: 4px;
          font-family: var(--font-mono);
          font-size: 9px;
          letter-spacing: 0.12em;
          color: var(--text-faint);
          text-transform: uppercase;
        }
        .refuel-stat b,
        .refuel-selection-summary b {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
          color: var(--text);
          font-size: 12px;
          font-weight: 700;
          overflow-wrap: anywhere;
        }
        .refuel-target-tanks {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin: 8px 0 10px;
          color: var(--text-dim);
          font-family: var(--font-mono);
          font-size: 11px;
        }
        .refuel-controls {
          display: grid;
          gap: 14px;
          margin: 12px 0;
        }
        .refuel-slider-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 5px;
        }
        .refuel-slider-label {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          color: var(--text-dim);
          font-size: 12px;
        }
        .refuel-slider-value {
          font-family: var(--font-mono);
          color: var(--accent);
          font-weight: 800;
        }
        .refuel-map-panel .cosmic-cta.primary {
          width: 100%;
          margin-top: 12px;
          padding: 12px 14px;
          border-radius: 14px;
        }
        .empty-hint {
          margin-top: 8px;
          padding: 16px;
          text-align: center;
          color: var(--text-faint);
          font-family: var(--font-mono);
          font-size: 12px;
          border: 1px dashed rgba(255,255,255,0.12);
          border-radius: 10px;
        }
        @media (max-width: 520px) {
          .refuel-source-grid {
            grid-template-columns: 1fr;
          }
          .refuel-map-panel {
            max-height: 48%;
          }
        }
      `}</style>
    </div>
  );
}

function FuelSlider({
  label,
  value,
  max,
  resourceId,
  locale,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  resourceId: "fuel" | "jump_fuel";
  locale: "en" | "ru";
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="refuel-slider-head">
        <div className="refuel-slider-label">
          {resourceId === "fuel" ? <Fuel size={15} /> : <Zap size={15} />}
          {label}
        </div>
        <div className="refuel-slider-value">
          <ResourceAmount
            resourceId={resourceId}
            amount={`${value} / ${max}`}
            iconSize={12}
            locale={locale}
          />
        </div>
      </div>
      <input
        type="range"
        className="cosmic-range"
        min={0}
        max={max}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}
