import React, { useEffect, useMemo, useState } from "react";
import { useMe } from "../hooks/useMe";
import {
  useBuildShip,
  useRushShip,
  useShipQueue,
  useShipTypes,
} from "../hooks/useShips";
import { ExpeditionDialog } from "../components/ExpeditionDialog";
import { RefuelDialog } from "../components/RefuelDialog";
import { ResourceBar } from "../components/ResourceBar";
import { ShieldStatus } from "../components/ShieldStatus";
import {
  CosmicBackground,
  CosmicBottomNav,
  QueueStrip,
} from "../components/cosmic/atoms";
import { ChevronDown, ChevronLeft } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import type { Ship, ShipQueueItem, ShipType } from "@shared/types/ships";
import type { RushPricing } from "@shared/types/diamonds";
import { estimateRushDiamondCost } from "@shared/types/diamonds";
import type { CombatStats, EngagementRange } from "@shared/types/combat";
import type { Building, Planet } from "@shared/types/world";
import { shipDescription } from "@shared/types/entity-labels";
import {
  getResourceLabel,
  ResourceAmount,
  ResourceAmountList,
} from "../components/cosmic/resources";
import { timerSnapshot } from "../lib/timers";
import {
  isShipReadyForOrders,
  mergeShipBuildQueue,
  queueItemFromBuildingShip,
} from "../lib/ship-queue";
import { useI18n } from "../lib/i18n";
import {
  resolveShipBuildBlockedReason,
  type ShipBuildBlockedReason,
} from "../lib/ship-build-eligibility";
import { resolveBuildingType } from "../components/cosmic/buildings";
import {
  getShipClassTag,
  getShipLabel,
  isShipTypeVisible,
  isShipTypeVisibleInShipyard,
  ShipIconBadge,
} from "../components/cosmic/ships";
import { isCargoTransferShip, isCargoTransferShipType } from "../lib/fleet";
import type { ExpeditionRouteMode } from "@shared/config/expeditionRouting";
import { researchBranchLabel } from "@shared/types/research";

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${String(seconds % 60).padStart(2, "0")}s`;
}

function combatRangeLabel(
  stats: CombatStats | undefined,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const range = stats?.missilePayload?.maxRange ?? stats?.engagementRange;
  const keyByRange: Partial<Record<EngagementRange, string>> = {
    close: "ships.range.close",
    medium: "ships.range.medium",
    long: "ships.range.long",
    orbital: "ships.range.orbital",
  };
  return range ? t(keyByRange[range] ?? "common.none") : t("common.none");
}

function missilePayloadLabel(
  stats: CombatStats | undefined,
  t: (key: string, params?: Record<string, string | number>) => string,
): string | null {
  const payload = stats?.missilePayload;
  if (!payload) return null;
  return t("ships.payload", {
    alpha: payload.alphaDamage,
    reload: payload.reloadSec,
  });
}

function ShipBuildQueue({
  queue,
  ships,
  shipTypes,
  now,
  diamondBalance,
  rushPricing,
  rushShip,
}: {
  queue: ShipQueueItem[];
  ships: Ship[];
  shipTypes: ShipType[];
  now: number;
  diamondBalance: number;
  rushPricing: RushPricing | null;
  rushShip: ReturnType<typeof useRushShip>;
}) {
  const { locale, t } = useI18n();
  const mergedQueue = useMemo(
    () => mergeShipBuildQueue(queue, ships),
    [queue, ships],
  );

  const head = mergedQueue[0];
  if (!head) return null;

  const snapshot = timerSnapshot({
    completesAt: head.queueCompletesAt,
    startedAt: head.queueStartedAt,
    nowMs: now,
  });
  const type = shipTypes.find((candidate) => candidate.id === head.typeId);
  const rushCost =
    rushPricing != null
      ? estimateRushDiamondCost(
          snapshot.remainingSec,
          rushPricing.diamondsPerMinute,
          rushPricing.maxPerAction,
        )
      : (head.rushCost ?? 0);
  const title = `${type?.name?.[locale] ?? getShipLabel(head.typeId, locale)} · ${t("ships.building")}`;
  const waitingForServerId = head.id.startsWith("temp-");

  return (
    <QueueStrip
      title={title}
      etaSec={snapshot.remainingSec}
      progressPct={snapshot.progressPct}
      rushCost={rushCost}
      diamondBalance={diamondBalance}
      rushBusy={rushShip.isPending}
      rushDisabled={waitingForServerId}
      rushLabel={t("ships.rushBuild")}
      onRush={() => {
        if (!waitingForServerId) rushShip.mutate(head.id);
      }}
    />
  );
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
  const [refuelingShip, setRefuelingShip] = useState<Ship | null>(null);
  const [refuelTargetShipId, setRefuelTargetShipId] = useState<string | null>(
    null,
  );
  const [selectedPlanetId, setSelectedPlanetId] = useState<string | null>(null);
  const [expandedShipId, setExpandedShipId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const ships = meData?.ships || [];
  const visibleShips = useMemo(
    () => ships.filter((ship) => isShipTypeVisible(ship.typeId)),
    [ships],
  );
  const origin = meData?.homeSystem || { sectorX: 0, sectorY: 0, sectorZ: 0 };
  const homePlanetId = meData?.homeSystem?.planets?.[0]?.id;
  const activeTab =
    new URLSearchParams(location.search).get("tab") === "shipyard"
      ? "shipyard"
      : new URLSearchParams(location.search).get("tab") === "military_shipyard"
        ? "military_shipyard"
        : "fleet";
  const jumpGateDestinationSystemId = new URLSearchParams(location.search).get(
    "destinationSystemId",
  );
  const requestedInitialRouteMode: ExpeditionRouteMode =
    new URLSearchParams(location.search).get("route") === "jump_gate" &&
    jumpGateDestinationSystemId
      ? "jump_gate"
      : "local";

  const getShipType = (typeId: string) =>
    shipTypes?.find((t) => t.id === typeId);
  const planets = meData?.planets ?? [];
  const colonizationSummary = meData?.colonization;
  const buildableShipTypes = useMemo(
    () =>
      (shipTypes ?? []).filter((type) => {
        if (!isShipTypeVisibleInShipyard(type.id)) return false;
        const isMilitary = type.requiredBuildings.some(
          (b) => b.typeId === "military_shipyard",
        );
        if (activeTab === "military_shipyard") return isMilitary;
        return !isMilitary;
      }),
    [shipTypes, activeTab],
  );

  const shipyardPlanets = useMemo(() => {
    return planets.filter((planet) =>
      (planet.buildings ?? []).some(
        (building) => building.typeId === "shipyard",
      ),
    );
  }, [planets]);

  const militaryShipyardPlanets = useMemo(() => {
    return planets.filter((planet) =>
      (planet.buildings ?? []).some(
        (building) => building.typeId === "military_shipyard",
      ),
    );
  }, [planets]);

  const currentTabPlanets =
    activeTab === "military_shipyard"
      ? militaryShipyardPlanets
      : shipyardPlanets;

  const resolvedPlanetId =
    selectedPlanetId ?? currentTabPlanets[0]?.id ?? homePlanetId ?? null;

  const selectedPlanet =
    currentTabPlanets.find((planet) => planet.id === resolvedPlanetId) ?? null;

  const buildingLevel = (planetBuildings: Building[], typeId: string) => {
    const level =
      planetBuildings.find((building) => building.typeId === typeId)?.level ??
      0;
    return level;
  };

  const formatRequirement = (
    planet: Planet | null,
    typeId: string,
    level: number,
  ) => {
    const building = resolveBuildingType(typeId);
    const current = planet ? buildingLevel(planet.buildings ?? [], typeId) : 0;
    return `${building.labels[locale]} L${level} (${t("ships.currentLevel", { level: current })})`;
  };

  const formatBuildBlock = (reason: ShipBuildBlockedReason) => {
    if (reason.type === "missingResearch") {
      return t("ships.blocked.research", {
        branch: researchBranchLabel(reason.branch, locale),
        level: reason.requiredLevel,
        current: reason.currentLevel,
      });
    }

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

    if (reason.type === "queueFull") {
      return t("ships.blocked.queueFull");
    }

    if (reason.type === "spaceportCapacityFull") {
      return t("ships.blocked.spaceportFull", {
        capacity: reason.capacity,
        occupied: reason.occupied,
        reserved: reason.reserved,
      });
    }

    return t("ships.blocked.resource", {
      resource: getResourceLabel(reason.resourceId, locale),
      required: reason.required,
      available: reason.available,
    });
  };

  const handleBuildShip = async (
    typeSlug: string,
    estimatedDurationSec: number,
  ) => {
    if (!selectedPlanet) return;
    try {
      await buildShip.mutateAsync({
        planetId: selectedPlanet.id,
        typeSlug,
        estimatedDurationSec,
      });
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
  const selectedShipType = selectedShip
    ? getShipType(selectedShip.typeId)
    : null;
  const selectedShipSupportsJumpGate =
    selectedShipType?.role === "recon" ||
    selectedShipType?.role === "colonization" ||
    selectedShip?.typeId === "colonizer";

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
              {activeTab === "shipyard"
                ? t("ships.shipyard")
                : activeTab === "military_shipyard"
                  ? t("ships.militaryShipyard")
                  : t("ships.fleetRoster")}
            </div>
          </div>
        </div>
        <div className="page-stat">
          <div className="ps-v">
            {activeTab === "fleet"
              ? visibleShips.length
              : currentTabPlanets.length}
          </div>
          <div className="ps-l">
            {activeTab === "fleet"
              ? t("ships.vessels").toUpperCase()
              : activeTab === "military_shipyard"
                ? t("ships.militaryShipyards").toUpperCase()
                : t("ships.shipyards").toUpperCase()}
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
        <button
          type="button"
          className="cosmic-cta"
          style={{
            flex: 1,
            opacity: activeTab === "military_shipyard" ? 1 : 0.65,
          }}
          onClick={() => navigate("/ships?tab=military_shipyard")}
        >
          {t("ships.militaryShipyard")}
        </button>
      </div>

      <div className="cosmic-scroll">
        {activeTab === "shipyard" || activeTab === "military_shipyard" ? (
          <div className="ship-list">
            {currentTabPlanets.length === 0 ? (
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
                {activeTab === "military_shipyard"
                  ? t("ships.noMilitaryShipyard").toUpperCase()
                  : t("ships.noShipyard").toUpperCase()}
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
                  {currentTabPlanets.map((planet) => (
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

                {buildableShipTypes.map((type) => {
                  const isColonizerHull =
                    type.role === "colonization" || type.id === "colonizer";
                  const payloadText = missilePayloadLabel(type.combatStats, t);
                  const requirements = type.requiredBuildings
                    .map((req) =>
                      formatRequirement(selectedPlanet, req.typeId, req.level),
                    )
                    .join(", ");
                  const blockedReason = selectedPlanet
                    ? resolveShipBuildBlockedReason(
                        selectedPlanet,
                        type,
                        meData?.research,
                        {
                          ships: meData?.ships,
                          expeditions: meData?.expeditions,
                        },
                      )
                    : null;
                  const canBuild = selectedPlanet
                    ? blockedReason === null
                    : false;
                  const blockedText = blockedReason
                    ? formatBuildBlock(blockedReason)
                    : null;
                  const colonizerAtCurrentLimit = Boolean(
                    isColonizerHull &&
                    colonizationSummary &&
                    colonizationSummary.currentColonies >=
                      colonizationSummary.maxColonies,
                  );

                  return (
                    <div key={type.id} className="ship-row">
                      <div className="ship-visual">
                        <ShipIconBadge
                          typeId={type.id}
                          status={canBuild ? "idle" : "building"}
                          size={36}
                          title={type.name[locale]}
                        />
                        <div className="ship-cls">
                          {getShipClassTag(type.id, locale)}
                        </div>
                      </div>
                      <div>
                        <div className="ship-name">{type.name[locale]}</div>
                        <div className="ship-loc">
                          {shipDescription(type.id, locale)}
                        </div>
                        <div className="ship-loc">
                          {t("ships.buildTime")}:{" "}
                          {Math.floor(type.buildTimeSec / 60)}m{" "}
                          {type.buildTimeSec % 60}s
                        </div>
                        <div className="ship-loc">
                          {t("common.cost")}:{" "}
                          <ResourceAmountList
                            items={Object.entries(type.buildCost).map(
                              ([resourceId, amount]) => ({
                                resourceId,
                                amount,
                              }),
                            )}
                            locale={locale}
                          />
                        </div>
                        <div className="ship-loc">
                          {t("ships.requires")}:{" "}
                          {requirements || t("common.none")}
                        </div>
                        <div className="ship-loc">
                          {t("ships.combatStats", {
                            hp: type.hp,
                            dps: type.dps,
                            range: combatRangeLabel(type.combatStats, t),
                            fuel: type.fuelCapacity,
                          })}
                        </div>
                        {payloadText ? (
                          <div className="ship-loc">{payloadText}</div>
                        ) : null}
                        <ShieldStatus shields={type.combatStats?.shields} />
                        {blockedText ? (
                          <div
                            className="ship-loc"
                            style={{ color: "#fca5a5" }}
                          >
                            {blockedText}
                          </div>
                        ) : null}
                        {isColonizerHull && colonizationSummary ? (
                          <div
                            className="ship-loc"
                            style={{
                              color: colonizerAtCurrentLimit
                                ? "#fcd34d"
                                : "var(--text-dim)",
                            }}
                          >
                            {colonizerAtCurrentLimit
                              ? t("ships.colonizerLimitWarning", {
                                  current: colonizationSummary.currentColonies,
                                  max: colonizationSummary.maxColonies,
                                  count:
                                    colonizationSummary.maxColoniesPerLogisticsLevel,
                                })
                              : t("colonize.logisticsLimitHint", {
                                  count:
                                    colonizationSummary.maxColoniesPerLogisticsLevel,
                                })}
                          </div>
                        ) : null}
                        <button
                          type="button"
                          disabled={
                            !selectedPlanet || !canBuild || buildShip.isPending
                          }
                          onClick={() =>
                            handleBuildShip(type.id, type.buildTimeSec)
                          }
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
                          <b>{type.hp}</b>
                        </div>
                        <div className="ship-stat">
                          <span>{t("ships.dps")}</span>
                          <b>{type.dps}</b>
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
            {visibleShips.length === 0 && (
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

            {visibleShips.map((ship) => {
              const type = getShipType(ship.typeId);
              const isCargoShip = isCargoTransferShip(ship, shipTypes);
              const isDiscoveryProbe = ship.typeId === "recon_probe";
              const queueItem =
                queueByShipId.get(ship.id) ?? queueItemFromBuildingShip(ship);
              const effectiveStatus = ship.status;
              const isIdle = isShipReadyForOrders(ship);
              const isBuilding = effectiveStatus === "building";
              const localRefueler =
                isIdle && ship.locationPlanetId
                  ? ships.find(
                      (s) =>
                        s.typeId === "refueler" &&
                        s.status === "idle" &&
                        s.locationPlanetId === ship.locationPlanetId,
                    )
                  : null;
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
              const expeditionLegLabel =
                activeExpedition?.status === "returning"
                  ? t("ships.returning")
                  : t("ships.outbound");
              const shipLocation = isIdle
                ? `${t("ships.orbit")} · ${origin.sectorX}:${origin.sectorY}:${origin.sectorZ}`
                : isBuilding
                  ? `${t("ships.underConstruction")}${etaSec != null ? ` · ETA ${formatDuration(etaSec)}` : ""}`
                  : activeExpedition && expeditionEtaSec != null
                    ? `${t("ships.inTransit")} · ${expeditionLegLabel} · ETA ${formatDuration(expeditionEtaSec)}`
                    : `${t("ships.inTransit")} · ${t("ships.syncingRoute")}`;
              const shipName =
                type?.name?.[locale] ?? getShipLabel(ship.typeId, locale);
              const isDestroyed = ship.status === "destroyed";
              const isDamaged = !isDestroyed && ship.hp < ship.maxHp;
              const expanded = expandedShipId === ship.id;
              const primaryAction = isIdle
                ? isCargoShip
                  ? t("ships.openCargo").toUpperCase()
                  : isDiscoveryProbe
                    ? t("ships.openJumpGate").toUpperCase()
                    : ship.typeId === "refueler"
                      ? t("refuel_dialog_transfer_button").toUpperCase()
                      : t("ships.sendMission").toUpperCase()
                : isBuilding
                  ? t("ships.building").toUpperCase()
                  : expeditionEtaSec != null
                    ? `ETA ${formatDuration(expeditionEtaSec)}`
                    : t("ships.inTransit").toUpperCase();
              const handlePrimaryAction = () => {
                if (isCargoShip) {
                  if (!ship.locationPlanetId) return;
                  const params = new URLSearchParams({
                    cargoOrigin: ship.locationPlanetId,
                    cargoShip: ship.id,
                  });
                  navigate(`/colonies?${params.toString()}`);
                  return;
                }
                if (isDiscoveryProbe) {
                  navigate("/map");
                  return;
                }
                setSelectedShip(ship);
              };
              return (
                <div
                  key={ship.id}
                  className={`ship-row ship-row-collapsible${expanded ? " is-expanded" : ""}`}
                >
                  <button
                    type="button"
                    className="ship-row-header"
                    aria-expanded={expanded}
                    onClick={() => setExpandedShipId(expanded ? null : ship.id)}
                  >
                    <ShipIconBadge
                      typeId={ship.typeId}
                      status={effectiveStatus}
                      size={36}
                      title={shipName}
                    />
                    <div className="ship-row-summary">
                      <div className="ship-name">{shipName}</div>
                      <div className="ship-loc">{shipLocation}</div>
                    </div>
                    <div className="ship-row-fuel-summary">
                      <ResourceAmount
                        resourceId="fuel"
                        amount={`${Number(ship.fuel).toFixed(0)}/${type?.fuelCapacity ?? 0}`}
                        iconSize={12}
                        locale={locale}
                      />
                      <ResourceAmount
                        resourceId="jump_fuel"
                        amount={`${Number(ship.jumpFuel).toFixed(0)}/${type?.jumpFuelCapacity ?? 0}`}
                        iconSize={12}
                        locale={locale}
                      />
                    </div>
                    <ChevronDown
                      size={18}
                      className="ship-row-chevron"
                      style={{
                        transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                        transition: "transform 0.15s ease",
                        color: "var(--text-faint)",
                      }}
                    />
                  </button>
                  {expanded ? (
                    <div className="ship-row-details">
                      <div
                        className="ship-stats"
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: "8px",
                          justifyContent: "stretch",
                        }}
                      >
                        <div className="ship-stat">
                          <span>{t("ships.hp")}</span>
                          <b
                            style={{
                              color: isDestroyed
                                ? "#ef4444"
                                : isDamaged
                                  ? "#fcd34d"
                                  : "inherit",
                            }}
                          >
                            {isDestroyed
                              ? t("common.destroyed").toUpperCase()
                              : `${Math.max(0, ship.hp)} / ${ship.maxHp}`}
                          </b>
                        </div>
                        <div className="ship-stat">
                          <span>{t("expedition.fuel")}</span>
                          <b>
                            {ship.fuel} / {type?.fuelCapacity ?? 0}
                          </b>
                        </div>
                        <div className="ship-stat">
                          <span>{t("expedition.jumpFuel")}</span>
                          <b>
                            {ship.jumpFuel} / {type?.jumpFuelCapacity ?? 0}
                          </b>
                        </div>
                        {isDamaged ? (
                          <div
                            className="ship-stat"
                            style={{ color: "#fcd34d" }}
                          >
                            <span>{t("common.status")}</span>
                            <b>{t("ships.damaged").toUpperCase()}</b>
                          </div>
                        ) : null}
                      </div>
                      <ShieldStatus
                        shields={
                          ship.combatStats?.shields ??
                          type?.combatStats?.shields
                        }
                      />
                      {isBuilding && buildTimer ? (
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
                      <div className="ship-row-actions">
                        <button
                          type="button"
                          disabled={
                            !isIdle || (isCargoShip && !ship.locationPlanetId)
                          }
                          onClick={handlePrimaryAction}
                          className="cosmic-cta"
                          style={{
                            padding: "6px 12px",
                            fontSize: 11,
                            opacity:
                              isIdle && (!isCargoShip || ship.locationPlanetId)
                                ? 1
                                : 0.4,
                            cursor:
                              isIdle && (!isCargoShip || ship.locationPlanetId)
                                ? "pointer"
                                : "not-allowed",
                          }}
                        >
                          {primaryAction}
                        </button>
                        {ship.typeId === "refueler" && isIdle && (
                          <button
                            type="button"
                            onClick={() => setRefuelingShip(ship)}
                            className="cosmic-cta"
                            style={{ padding: "6px 12px", fontSize: 11 }}
                          >
                            {t("refuel_dialog_title").toUpperCase()}
                          </button>
                        )}
                        {ship.typeId !== "refueler" &&
                          isIdle &&
                          localRefueler && (
                            <button
                              type="button"
                              onClick={() => {
                                setRefuelingShip(localRefueler);
                                setRefuelTargetShipId(ship.id);
                              }}
                              className="cosmic-cta"
                              style={{ padding: "6px 12px", fontSize: 11 }}
                            >
                              {t("refuel_dialog_title").toUpperCase()}
                            </button>
                          )}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="fixed-bottom-ui">
        <ShipBuildQueue
          queue={shipQueueData?.queue ?? []}
          ships={visibleShips}
          shipTypes={shipTypes ?? []}
          now={now}
          diamondBalance={meData?.diamonds ?? 0}
          rushPricing={meData?.rushPricing ?? null}
          rushShip={rushShip}
        />
        <CosmicBottomNav />
      </div>

      {selectedShip &&
        selectedShipType &&
        !isCargoTransferShipType(selectedShipType) && (
          <ExpeditionDialog
            ship={selectedShip}
            shipType={selectedShipType}
            originX={Number(origin.sectorX)}
            originY={Number(origin.sectorY)}
            originZ={Number(origin.sectorZ)}
            initialRouteMode={
              selectedShipSupportsJumpGate ? requestedInitialRouteMode : "local"
            }
            initialDestinationSystemId={
              selectedShipSupportsJumpGate ? jumpGateDestinationSystemId : null
            }
            onClose={() => setSelectedShip(null)}
          />
        )}

      {refuelingShip && (
        <RefuelDialog
          sourceShip={refuelingShip}
          sourceType={getShipType(refuelingShip.typeId)!}
          sourcePlanet={
            planets.find(
              (planet) => planet.id === refuelingShip.locationPlanetId,
            ) ?? null
          }
          allShips={ships}
          allShipTypes={shipTypes ?? []}
          initialTargetShipId={refuelTargetShipId ?? undefined}
          onClose={() => {
            setRefuelingShip(null);
            setRefuelTargetShipId(null);
          }}
        />
      )}
    </div>
  );
}
