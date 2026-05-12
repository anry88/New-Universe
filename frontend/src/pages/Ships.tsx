import React, { useEffect, useMemo, useState } from "react";
import { useMe } from "../hooks/useMe";
import {
  useBuildShip,
  useRushShip,
  useShipQueue,
  useShipTypes,
} from "../hooks/useShips";
import { ExpeditionDialog } from "../components/ExpeditionDialog";
import { ResourceBar } from "../components/ResourceBar";
import { CosmicBackground, CosmicBottomNav } from "../components/cosmic/atoms";
import { ChevronLeft } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import type { Ship } from "@shared/types/ships";
import type { Building, Planet } from "@shared/types/world";
import { getResourceSymbol } from "../components/cosmic/resources";
import { timerSnapshot } from "../lib/timers";
import { useI18n } from "../lib/i18n";
import {
  resolveShipBuildBlockedReason,
  type ShipBuildBlockedReason,
} from "../lib/ship-build-eligibility";
import { resolveBuildingType } from "../components/cosmic/buildings";

const SHIP_CLASS_TAG: Record<string, string> = {
  scout: "SCOUT",
  cargo_light: "CARGO",
  cargo: "CARGO",
  colonizer: "COLONIZE",
  jump: "JUMP",
  fighter: "COMBAT",
};

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
}

/**
 * Fleet roster — Cosmic Atlas redesign.
 *
 * Each ship is a single grid row with a class tag, name + status row, HP/Fuel
 * stats, and a Send Mission button. The list is rendered inside the screen's
 * standard scroll container; bottom navigation and resource bar provide the
 * shared chrome.
 */
export function ShipsPage() {
  const { data: meData } = useMe();
  const { data: shipTypes } = useShipTypes();
  const { data: shipQueueData } = useShipQueue();
  const buildShip = useBuildShip();
  const rushShip = useRushShip();
  const navigate = useNavigate();
  const location = useLocation();
  const { locale, t } = useI18n();
  const [selectedShip, setSelectedShip] = useState<Ship | null>(null);
  const [selectedPlanetId, setSelectedPlanetId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const ships = meData?.ships || [];
  const origin = meData?.homeSystem || { sectorX: 0, sectorY: 0, sectorZ: 0 };
  const homePlanetId = meData?.homeSystem?.planets?.[0]?.id;
  const activeTab =
    new URLSearchParams(location.search).get("tab") === "shipyard"
      ? "shipyard"
      : "fleet";

  const getShipType = (typeId: string) =>
    shipTypes?.find((t) => t.id === typeId);
  const planets = meData?.planets ?? [];

  const shipyardPlanets = useMemo(() => {
    return planets.filter((planet) =>
      (planet.buildings ?? []).some(
        (building) => building.typeId === "shipyard",
      ),
    );
  }, [planets]);

  const resolvedPlanetId =
    selectedPlanetId ?? shipyardPlanets[0]?.id ?? homePlanetId ?? null;

  const selectedPlanet =
    shipyardPlanets.find((planet) => planet.id === resolvedPlanetId) ?? null;

  const buildingLevel = (planetBuildings: Building[], typeId: string) => {
    const level =
      planetBuildings.find((building) => building.typeId === typeId)?.level ??
      0;
    return level;
  };

  const formatRequirement = (planet: Planet | null, typeId: string, level: number) => {
    const building = resolveBuildingType(typeId);
    const current = planet ? buildingLevel(planet.buildings ?? [], typeId) : 0;
    return `${building.labels[locale]} L${level} (${t("ships.currentLevel", { level: current })})`;
  };

  const formatBuildBlock = (reason: ShipBuildBlockedReason) => {
    if (reason.type === "missingBuilding") {
      if (reason.typeId === "shipyard") {
        return t("ships.blocked.shipyardLevel", {
          level: reason.requiredLevel,
          current: reason.currentLevel,
        });
      }
      const building = resolveBuildingType(reason.typeId);
      return t("ships.blocked.buildingLevel", {
        building: building.labels[locale],
        level: reason.requiredLevel,
        current: reason.currentLevel,
      });
    }

    return t("ships.blocked.resource", {
      resource: getResourceSymbol(reason.resourceId),
      required: reason.required,
      available: reason.available,
    });
  };

  const handleBuildShip = async (typeSlug: string) => {
    if (!selectedPlanet) return;
    try {
      await buildShip.mutateAsync({ planetId: selectedPlanet.id, typeSlug });
      alert(t("ships.queueAdded"));
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : t("ships.queueFailed");
      alert(message);
    }
  };

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const queueByShipId = new Map(
    (shipQueueData?.queue ?? []).map((q) => [q.id, q]),
  );
  const activeExpeditionByShipId = useMemo(() => {
    return new Map(
      (meData?.expeditions ?? [])
        .filter(
          (exp) => exp.status === "in_flight" || exp.status === "returning",
        )
        .map((exp) => [exp.shipId, exp]),
    );
  }, [meData?.expeditions]);

  return (
    <div
      className="cosmic-screen"
      style={{ "--accent": "#5BD7FF" } as React.CSSProperties}
    >
      <CosmicBackground accent="#5BD7FF" starSeed={11} />

      <ResourceBar planetId={homePlanetId} />

      <div className="page-head" style={{ position: "relative", zIndex: 2 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            aria-label={t("common.back")}
            onClick={() => navigate("/")}
            style={{ padding: 4, borderRadius: 999, color: "var(--text-dim)" }}
          >
            <ChevronLeft size={20} />
          </button>
          <div>
            <div className="page-tag">{t("ships.command").toUpperCase()}</div>
            <div className="page-title">
              {activeTab === "shipyard" ? t("ships.shipyard") : t("ships.fleetRoster")}
            </div>
          </div>
        </div>
        <div className="page-stat">
          <div className="ps-v">
            {activeTab === "shipyard" ? shipyardPlanets.length : ships.length}
          </div>
          <div className="ps-l">
            {activeTab === "shipyard" ? t("ships.shipyards").toUpperCase() : t("ships.vessels").toUpperCase()}
          </div>
        </div>
      </div>

      <div
        style={{
          position: "relative",
          zIndex: 2,
          display: "flex",
          gap: 8,
          padding: "0 12px 8px",
        }}
      >
        <button
          type="button"
          className="cosmic-cta"
          style={{ flex: 1, opacity: activeTab === "fleet" ? 1 : 0.65 }}
          onClick={() => navigate("/ships")}
        >
          {t("nav.fleet")}
        </button>
        <button
          type="button"
          className="cosmic-cta"
          style={{ flex: 1, opacity: activeTab === "shipyard" ? 1 : 0.65 }}
          onClick={() => navigate("/ships?tab=shipyard")}
        >
          {t("ships.shipyard")}
        </button>
      </div>

      <div className="cosmic-scroll">
        {activeTab === "shipyard" ? (
          <div className="ship-list">
            {shipyardPlanets.length === 0 ? (
              <div
                style={{
                  padding: "40px 20px",
                  textAlign: "center",
                  color: "var(--text-faint)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  letterSpacing: "0.1em",
                  border: "1px dashed var(--line-strong)",
                  borderRadius: 12,
                }}
              >
                {t("ships.noShipyard").toUpperCase()}
              </div>
            ) : (
              <>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    marginBottom: 10,
                    overflowX: "auto",
                  }}
                >
                  {shipyardPlanets.map((planet) => (
                    <button
                      key={planet.id}
                      type="button"
                      onClick={() => setSelectedPlanetId(planet.id)}
                      className="cosmic-cta"
                      style={{
                        padding: "6px 10px",
                        fontSize: 11,
                        opacity: planet.id === resolvedPlanetId ? 1 : 0.65,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {planet.name}
                    </button>
                  ))}
                </div>

                {(shipTypes ?? []).map((type) => {
                  const requirements = type.requiredBuildings
                    .map((req) =>
                      formatRequirement(selectedPlanet, req.typeId, req.level),
                    )
                    .join(", ");
                  const blockedReason = selectedPlanet
                    ? resolveShipBuildBlockedReason(selectedPlanet, type)
                    : null;
                  const canBuild = selectedPlanet ? blockedReason === null : false;
                  const blockedText = blockedReason
                    ? formatBuildBlock(blockedReason)
                    : null;

                  return (
                    <div key={type.id} className="ship-row">
                      <div className="ship-cls">
                        {SHIP_CLASS_TAG[type.id.toLowerCase()] ??
                          type.id.slice(0, 6).toUpperCase()}
                      </div>
                      <div>
                        <div className="ship-name">{type.name[locale]}</div>
                        <div className="ship-loc">
                          {t("ships.buildTime")}: {Math.floor(type.buildTimeSec / 60)}m{" "}
                          {type.buildTimeSec % 60}s
                        </div>
                        <div className="ship-loc">
                          {t("common.cost")}:{" "}
                          {Object.entries(type.buildCost)
                            .map(
                              ([resourceId, amount]) =>
                                `${getResourceSymbol(resourceId)} ${amount}`,
                            )
                            .join(" · ")}
                        </div>
                        <div className="ship-loc">
                          {t("ships.requires")}: {requirements || t("common.none")}
                        </div>
                        {blockedText ? (
                          <div className="ship-loc" style={{ color: "#fca5a5" }}>
                            {blockedText}
                          </div>
                        ) : null}
                        <button
                          type="button"
                          disabled={
                            !selectedPlanet || !canBuild || buildShip.isPending
                          }
                          onClick={() => handleBuildShip(type.id)}
                          className="cosmic-cta"
                          style={{
                            marginTop: 6,
                            padding: "6px 12px",
                            fontSize: 11,
                            opacity:
                              !selectedPlanet ||
                              !canBuild ||
                              buildShip.isPending
                                ? 0.45
                                : 1,
                            cursor:
                              !selectedPlanet ||
                              !canBuild ||
                              buildShip.isPending
                                ? "not-allowed"
                                : "pointer",
                          }}
                        >
                          {buildShip.isPending
                            ? t("ships.queuing").toUpperCase()
                            : canBuild
                              ? t("ships.buildShip").toUpperCase()
                              : t("common.locked").toUpperCase()}
                        </button>
                      </div>
                      <div className="ship-stats">
                        <div className="ship-stat">
                          <span>{t("ships.hp")}</span>
                          <b>{type.armor}</b>
                        </div>
                        <div className="ship-stat">
                          <span>{t("ships.speed")}</span>
                          <b>{type.speed}</b>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        ) : (
          <div className="ship-list">
            {ships.length === 0 && (
              <div
                style={{
                  padding: "40px 20px",
                  textAlign: "center",
                  color: "var(--text-faint)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  letterSpacing: "0.1em",
                  border: "1px dashed var(--line-strong)",
                  borderRadius: 12,
                }}
              >
                {t("ships.noShips").toUpperCase()}
              </div>
            )}

            {ships.map((ship) => {
              const type = getShipType(ship.typeId);
              const cls =
                SHIP_CLASS_TAG[ship.typeId.toLowerCase()] ??
                ship.typeId.slice(0, 6).toUpperCase();
              const queueItem = queueByShipId.get(ship.id);
              const effectiveStatus =
                ship.status === "building" && !queueItem ? "idle" : ship.status;
              const isIdle = effectiveStatus === "idle";
              const isBuilding = effectiveStatus === "building";
              const activeExpedition = activeExpeditionByShipId.get(ship.id);
              const buildTimer = queueItem
                ? timerSnapshot({
                    completesAt: queueItem.queueCompletesAt,
                    startedAt: queueItem.queueStartedAt,
                    nowMs: now,
                  })
                : null;
              const etaSec = buildTimer?.remainingSec ?? null;
              const expeditionEtaSec = activeExpedition
                ? Math.max(
                    0,
                    Math.ceil(
                      (new Date(activeExpedition.eta).getTime() - now) / 1000,
                    ),
                  )
                : null;
              const expeditionLeg =
                activeExpedition?.status === "returning"
                  ? "Returning"
                  : t("ships.outbound");
              const expeditionLegLabel =
                activeExpedition?.status === "returning"
                  ? t("ships.returning")
                  : expeditionLeg;
              const shipLocation = isIdle
                ? `${t("ships.orbit")} · ${origin.sectorX}:${origin.sectorY}:${origin.sectorZ}`
                : isBuilding
                  ? `${t("ships.underConstruction")}${etaSec != null ? ` · ETA ${formatDuration(etaSec)}` : ""}`
                  : activeExpedition && expeditionEtaSec != null
                    ? `${t("ships.inTransit")} · ${expeditionLegLabel} · ETA ${formatDuration(expeditionEtaSec)}`
                    : `${t("ships.inTransit")} · ${t("ships.syncingRoute")}`;
              return (
                <div key={ship.id} className="ship-row">
                  <div className="ship-cls">{cls}</div>
                  <div>
                    <div className="ship-name">
                      {type?.name?.[locale] ?? ship.typeId}
                    </div>
                    <div className="ship-loc">{shipLocation}</div>
                    <button
                      type="button"
                      disabled={!isIdle}
                      onClick={() => setSelectedShip(ship)}
                      className="cosmic-cta"
                      style={{
                        marginTop: 6,
                        padding: "6px 12px",
                        fontSize: 11,
                        opacity: isIdle ? 1 : 0.4,
                        cursor: isIdle ? "pointer" : "not-allowed",
                      }}
                    >
                      {isIdle
                        ? t("ships.sendMission").toUpperCase()
                        : isBuilding
                          ? t("ships.building").toUpperCase()
                          : expeditionEtaSec != null
                            ? `ETA ${formatDuration(expeditionEtaSec)}`
                            : t("ships.inTransit").toUpperCase()}
                    </button>
                    {isBuilding && queueItem ? (
                      <>
                        {buildTimer ? (
                          <div className="qstrip-bar" style={{ marginTop: 8 }}>
                            <div
                              className="qstrip-fill"
                              style={{
                                width: `${buildTimer.progressPct}%`,
                                background: "#5BD7FF",
                                boxShadow: "0 0 6px #5BD7FF",
                              }}
                            />
                          </div>
                        ) : null}
                        <button
                          type="button"
                          className="cosmic-cta"
                          onClick={() => rushShip.mutate(ship.id)}
                          disabled={rushShip.isPending}
                          style={{
                            marginTop: 6,
                            padding: "6px 12px",
                            fontSize: 11,
                          }}
                        >
                          {rushShip.isPending
                            ? t("ships.rushing").toUpperCase()
                            : `◆ ${queueItem.rushCost ?? 0} ${t("ships.rushBuild").toUpperCase()}`}
                        </button>
                      </>
                    ) : null}
                  </div>
                  <div className="ship-stats">
                    <div className="ship-stat">
                      <span>{t("ships.hp")}</span>
                      <b>{type?.armor ?? 0}</b>
                    </div>
                    <div className="ship-stat">
                      <span>{t("ships.speed")}</span>
                      <b>{type?.speed ?? 0}</b>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <CosmicBottomNav />

      {selectedShip && getShipType(selectedShip.typeId) && (
        <ExpeditionDialog
          ship={selectedShip}
          shipType={getShipType(selectedShip.typeId)!}
          originX={Number(origin.sectorX)}
          originY={Number(origin.sectorY)}
          originZ={Number(origin.sectorZ)}
          onClose={() => setSelectedShip(null)}
        />
      )}
    </div>
  );
}
