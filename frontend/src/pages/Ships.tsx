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

const SHIP_CLASS_TAG: Record<string, string> = {
  scout: "SCOUT",
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

  const hasRequiredBuilding = (
    planetBuildings: Building[],
    typeId: string,
    minLevel: number,
  ) => {
    const level =
      planetBuildings.find((building) => building.typeId === typeId)?.level ??
      0;
    return level >= minLevel;
  };

  const canBuildShip = (planet: Planet, shipTypeId: string) => {
    const type = getShipType(shipTypeId);
    if (!type) return false;
    return type.requiredBuildings.every((req) =>
      hasRequiredBuilding(planet.buildings ?? [], req.typeId, req.level),
    );
  };

  const handleBuildShip = async (typeSlug: string) => {
    if (!selectedPlanet) return;
    try {
      await buildShip.mutateAsync({ planetId: selectedPlanet.id, typeSlug });
      alert("Ship added to shipyard queue.");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to queue ship build";
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
            aria-label="Back"
            onClick={() => navigate("/")}
            style={{ padding: 4, borderRadius: 999, color: "var(--text-dim)" }}
          >
            <ChevronLeft size={20} />
          </button>
          <div>
            <div className="page-tag">FLEET COMMAND</div>
            <div className="page-title">
              {activeTab === "shipyard" ? "Shipyard" : "Fleet Roster"}
            </div>
          </div>
        </div>
        <div className="page-stat">
          <div className="ps-v">
            {activeTab === "shipyard" ? shipyardPlanets.length : ships.length}
          </div>
          <div className="ps-l">
            {activeTab === "shipyard" ? "SHIPYARDS" : "VESSELS"}
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
          Fleet
        </button>
        <button
          type="button"
          className="cosmic-cta"
          style={{ flex: 1, opacity: activeTab === "shipyard" ? 1 : 0.65 }}
          onClick={() => navigate("/ships?tab=shipyard")}
        >
          Shipyard
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
                NO SHIPYARD FOUND — BUILD SHIPYARD ON A PLANET FIRST
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
                    .map((req) => `${req.typeId} L${req.level}`)
                    .join(", ");
                  const canBuild = selectedPlanet
                    ? canBuildShip(selectedPlanet, type.id)
                    : false;

                  return (
                    <div key={type.id} className="ship-row">
                      <div className="ship-cls">
                        {SHIP_CLASS_TAG[type.id.toLowerCase()] ??
                          type.id.slice(0, 6).toUpperCase()}
                      </div>
                      <div>
                        <div className="ship-name">{type.name.en}</div>
                        <div className="ship-loc">
                          Build time: {Math.floor(type.buildTimeSec / 60)}m{" "}
                          {type.buildTimeSec % 60}s
                        </div>
                        <div className="ship-loc">
                          Cost:{" "}
                          {Object.entries(type.buildCost)
                            .map(
                              ([resourceId, amount]) =>
                                `${getResourceSymbol(resourceId)} ${amount}`,
                            )
                            .join(" · ")}
                        </div>
                        <div className="ship-loc">
                          Requires: {requirements || "None"}
                        </div>
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
                            ? "QUEUING..."
                            : canBuild
                              ? "BUILD SHIP"
                              : "LOCKED"}
                        </button>
                      </div>
                      <div className="ship-stats">
                        <div className="ship-stat">
                          <span>HP</span>
                          <b>{type.armor}</b>
                        </div>
                        <div className="ship-stat">
                          <span>SPD</span>
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
                NO SHIPS — OPEN SHIPYARD TAB TO START BUILDING
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
              const etaSec = queueItem
                ? Math.max(
                    0,
                    Math.ceil(
                      (new Date(queueItem.queueCompletesAt).getTime() - now) /
                        1000,
                    ),
                  )
                : null;
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
                  : "Outbound";
              const shipLocation = isIdle
                ? `Orbit · ${origin.sectorX}:${origin.sectorY}:${origin.sectorZ}`
                : isBuilding
                  ? `Under construction${etaSec != null ? ` · ETA ${formatDuration(etaSec)}` : ""}`
                  : activeExpedition && expeditionEtaSec != null
                    ? `In transit · ${expeditionLeg} · ETA ${formatDuration(expeditionEtaSec)}`
                    : `In transit · syncing route`;
              return (
                <div key={ship.id} className="ship-row">
                  <div className="ship-cls">{cls}</div>
                  <div>
                    <div className="ship-name">
                      {type?.name?.en ?? ship.typeId}
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
                        ? "SEND MISSION"
                        : isBuilding
                          ? "BUILDING"
                          : expeditionEtaSec != null
                            ? `ETA ${formatDuration(expeditionEtaSec)}`
                            : "IN TRANSIT"}
                    </button>
                    {isBuilding && queueItem ? (
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
                          ? "RUSHING..."
                          : `◆ ${queueItem.rushCost ?? 0} RUSH BUILD`}
                      </button>
                    ) : null}
                  </div>
                  <div className="ship-stats">
                    <div className="ship-stat">
                      <span>HP</span>
                      <b>{type?.armor ?? 0}</b>
                    </div>
                    <div className="ship-stat">
                      <span>SPD</span>
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
