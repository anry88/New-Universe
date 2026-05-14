import type { Ship, ShipType } from "@shared/types/ships";
import {
  formatLaunchExpeditionErrorMessage,
  type LaunchExpeditionErrorDetails,
} from "@shared/types/expeditions";
import type {
  JumpGateDestinationPlanetSummary,
  JumpGateKnownDestinationSummary,
} from "@shared/types/jump-gate";
import {
  JUMP_FUEL_RESOURCE_ID,
  type ExpeditionRouteMode,
} from "@shared/config/expeditionRouting";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { useLaunchExpedition } from "../hooks/useExpeditions";
import { useJumpGateState } from "../hooks/useJumpGateState";
import { useMe } from "../hooks/useMe";
import {
  X,
  Send,
  Navigation,
  Fuel,
  Box,
  Timer,
  Target,
  AlertTriangle,
} from "lucide-react";
import { useState, useMemo, useCallback } from "react";
import { CosmicBackground } from "./cosmic/atoms";
import {
  CosmicSystemRenderer,
  type ExpeditionPickConfig,
} from "./cosmic/SystemMap";
import { getShipClassTag, ShipIconBadge } from "./cosmic/ships";
import { useI18n } from "../lib/i18n";
import { buildExpeditionPreview } from "../lib/expedition-routing";
import { systemMapPlanetDistanceLy } from "@shared/format/systemMapLayout";

interface ExpeditionDialogProps {
  ship: Ship;
  shipType: ShipType;
  originX: number;
  originY: number;
  originZ: number;
  initialRouteMode?: ExpeditionRouteMode;
  initialDestinationSystemId?: string | null;
  onClose: () => void;
}

interface ColonizationEligibilityResponse {
  eligibility: {
    allowed: boolean;
    reason?: string;
    details?: {
      currentColonies: number;
      maxColonies: number;
      cooldownRemainingSec: number;
      requiredResearch: { branch: string; level: number };
      currentResearch: number;
      distance?: number;
    };
  };
  rules: {
    maxColoniesPerLogisticsLevel: number;
  };
}

export function ExpeditionDialog({
  ship,
  shipType,
  originX,
  originY,
  originZ,
  initialRouteMode,
  initialDestinationSystemId,
  onClose,
}: ExpeditionDialogProps) {
  const { data: meData } = useMe();
  const { data: jumpGateState, isLoading: jumpGateLoading } =
    useJumpGateState();
  const { locale, t } = useI18n();
  const [routeMode, setRouteMode] = useState<ExpeditionRouteMode>(
    initialRouteMode ?? "local",
  );
  const [target, setTarget] = useState({
    x: originX + 10,
    y: originY + 10,
    z: originZ,
  });
  const [targetPlanetId, setTargetPlanetId] = useState<string | null>(null);
  const [selectedDestinationSystemId, setSelectedDestinationSystemId] =
    useState<string | null>(initialDestinationSystemId ?? null);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [cargo] = useState(0);
  const launch = useLaunchExpedition();

  const homeSystem = meData?.homeSystem;
  const isColonizer =
    shipType.role === "colonization" || ship.typeId === "colonizer";
  const supportsJumpGateExpedition = shipType.role === "recon" || isColonizer;
  const colonizationTargets = useMemo(
    () =>
      (homeSystem?.planets ?? []).filter(
        (planet) =>
          planet.id !== ship.locationPlanetId &&
          planet.isDiscovered !== false &&
          planet.isColonized === false,
      ),
    [homeSystem?.planets, ship.locationPlanetId],
  );
  const ownedPlanetIds = useMemo(
    () =>
      new Set(
        meData?.planets
          ?.filter((planet) => planet.isColonized !== false)
          .map((planet) => planet.id) ?? [],
      ),
    [meData?.planets],
  );

  const shipPlanet = useMemo(
    () => meData?.planets?.find((p) => p.id === ship.locationPlanetId),
    [meData?.planets, ship.locationPlanetId],
  );
  const selectedLocalTargetPlanet = useMemo(
    () =>
      colonizationTargets.find((planet) => planet.id === targetPlanetId) ??
      null,
    [colonizationTargets, targetPlanetId],
  );
  const knownDestinations = jumpGateState?.knownDestinations ?? [];
  const selectedDestination = useMemo<JumpGateKnownDestinationSummary | null>(
    () =>
      knownDestinations.find(
        (destination) => destination.systemId === selectedDestinationSystemId,
      ) ??
      knownDestinations[0] ??
      null,
    [knownDestinations, selectedDestinationSystemId],
  );
  const jumpPlanetTargets = selectedDestination?.planets ?? [];
  const jumpColonizationTargets = useMemo(
    () =>
      jumpPlanetTargets.filter(
        (planet) =>
          planet.isDiscovered && !planet.isColonized && !planet.isOwnedColony,
      ),
    [jumpPlanetTargets],
  );
  const selectedJumpTargetPlanet = useMemo(
    () =>
      jumpPlanetTargets.find((planet) => planet.id === targetPlanetId) ?? null,
    [jumpPlanetTargets, targetPlanetId],
  );
  const colonizationEligibility = useQuery({
    queryKey: ["colonization-eligibility", targetPlanetId],
    queryFn: () =>
      apiFetch<ColonizationEligibilityResponse>(
        `/colonies/eligibility/${targetPlanetId}`,
      ),
    enabled: isColonizer && Boolean(targetPlanetId),
    staleTime: 5_000,
  });
  const fuelAvailable = useMemo(() => {
    const row = shipPlanet?.resources?.find((r) => r.resourceId === "fuel");
    return Math.floor(Number(row?.amount ?? 0));
  }, [shipPlanet?.resources]);
  const jumpFuelAvailable = useMemo(() => {
    const row = shipPlanet?.resources?.find(
      (r) => r.resourceId === JUMP_FUEL_RESOURCE_ID,
    );
    return Math.floor(Number(row?.amount ?? 0));
  }, [shipPlanet?.resources]);

  const sameSystemPlanetDistance = useMemo(() => {
    if (
      routeMode === "local" &&
      isColonizer &&
      selectedLocalTargetPlanet &&
      ship.locationPlanetId &&
      homeSystem?.planets
    ) {
      return systemMapPlanetDistanceLy(
        homeSystem.planets,
        Number(homeSystem.seed),
        ship.locationPlanetId,
        selectedLocalTargetPlanet.id,
      );
    }

    return null;
  }, [
    homeSystem?.planets,
    homeSystem?.seed,
    isColonizer,
    routeMode,
    selectedLocalTargetPlanet,
    ship.locationPlanetId,
  ]);

  const routeTarget = useMemo(
    () =>
      routeMode === "jump_gate" && selectedDestination
        ? {
            x: selectedDestination.sector.x,
            y: selectedDestination.sector.y,
            z: selectedDestination.sector.z,
          }
        : target,
    [routeMode, selectedDestination, target],
  );

  const preview = useMemo(
    () =>
      buildExpeditionPreview({
        routeMode,
        originSector: { x: originX, y: originY },
        targetSector: { x: routeTarget.x, y: routeTarget.y },
        sameSystemPlanetDistance,
        hasTargetPlanet: Boolean(targetPlanetId),
        isColonizer,
        fuelConsumption: Number(shipType.fuelConsumption),
        speed: Number(shipType.speed),
      }),
    [
      isColonizer,
      originX,
      originY,
      routeMode,
      routeTarget.x,
      routeTarget.y,
      sameSystemPlanetDistance,
      shipType.fuelConsumption,
      shipType.speed,
      targetPlanetId,
    ],
  );

  const effectiveDistance = preview.distance;
  const etaSeconds = preview.etaSeconds;
  const recommendedFuel = preview.fuelRequired;
  const jumpFuelRequired = preview.jumpFuelRequired;

  const shortOnFuel = fuelAvailable > 0 && recommendedFuel > fuelAvailable;
  const shortOnJumpFuel =
    routeMode === "jump_gate" && jumpFuelRequired > jumpFuelAvailable;
  const colonizationDetails =
    colonizationEligibility.data?.eligibility.details;
  const colonizationGateBlocked = Boolean(
    isColonizer &&
      targetPlanetId &&
      colonizationEligibility.data &&
      !colonizationEligibility.data.eligibility.allowed,
  );
  const colonizationPreflightPending = Boolean(
    isColonizer && targetPlanetId && colonizationEligibility.isLoading,
  );
  const colonizationPerLogisticsLevel =
    colonizationEligibility.data?.rules.maxColoniesPerLogisticsLevel ??
    meData?.colonization?.maxColoniesPerLogisticsLevel ??
    5;
  const colonizationPreflightMessage = (() => {
    if (!isColonizer || !targetPlanetId) return null;
    if (colonizationPreflightPending) {
      return t("expedition.checkingColonization");
    }

    const eligibility = colonizationEligibility.data?.eligibility;
    if (!eligibility || eligibility.allowed) return null;

    const reason = eligibility.reason?.toLowerCase() ?? "";
    const cooldownRemainingSec =
      colonizationDetails?.cooldownRemainingSec ?? 0;
    if (cooldownRemainingSec > 0 || reason.includes("cooldown")) {
      return t("expedition.colonizationCooldown", {
        minutes: Math.max(1, Math.ceil(cooldownRemainingSec / 60)),
      });
    }

    if (reason.includes("colony limit")) {
      return t("expedition.colonyLimitPreflight", {
        current:
          colonizationDetails?.currentColonies ??
          meData?.colonization?.currentColonies ??
          0,
        max:
          colonizationDetails?.maxColonies ??
          meData?.colonization?.maxColonies ??
          0,
        count: colonizationPerLogisticsLevel,
      });
    }

    return formatLaunchExpeditionErrorMessage(
      { code: "expedition_colonization_blocked", reason: eligibility.reason },
      locale,
    );
  })();
  const jumpGateUnavailable = !jumpGateState?.unlocked;
  const jumpGateCalibrating =
    jumpGateState?.calibration.status === "calibrating";
  const jumpGateBlocked =
    routeMode === "jump_gate" &&
    (jumpGateUnavailable || jumpGateCalibrating || !selectedDestination);
  const launchBlocked =
    recommendedFuel <= 0 ||
    recommendedFuel > fuelAvailable ||
    fuelAvailable <= 0 ||
    shortOnJumpFuel ||
    colonizationPreflightPending ||
    colonizationGateBlocked ||
    jumpGateBlocked ||
    (isColonizer && !targetPlanetId);

  const jumpGateStatusText = jumpGateLoading
    ? t("expedition.loadingJumpGate")
    : !jumpGateState
      ? t("jumpGate.error.loadFailed")
      : !jumpGateState.unlocked
        ? t("expedition.jumpGateLocked")
        : jumpGateState.calibration.status === "calibrating"
          ? t("jumpGate.random.calibrationInProgress")
          : knownDestinations.length === 0
            ? t("jumpGate.destinations.empty")
            : t("expedition.jumpGateReady");

  const jumpPlanetLabel = (planet: JumpGateDestinationPlanetSummary) =>
    planet.name ?? t("expedition.unknownBody", { index: planet.orbitIndex });
  const selectableJumpPlanets = isColonizer
    ? jumpColonizationTargets
    : jumpPlanetTargets.filter((planet) => !planet.isDiscovered);

  const formatLaunchError = (message: string, code?: string, details?: unknown) => {
    if (code) {
      return formatLaunchExpeditionErrorMessage(
        { code, ...((details ?? {}) as Record<string, unknown>) } as LaunchExpeditionErrorDetails,
        locale,
      );
    }

    const lower = message.toLowerCase();
    if (lower.includes("ship must be idle")) return t("expedition.error.shipNotIdle");
    if (lower.includes("targetplanetid") || lower.includes("target planet")) return t("expedition.error.targetRequired");
    if (lower.includes("not enough jump_fuel") || lower.includes("jump fuel")) return t("expedition.error.notEnoughJumpFuel");
    if (lower.includes("not enough fuel")) return t("expedition.error.notEnoughFuel");
    if (lower.includes("colonization on cooldown")) return t("expedition.error.cooldown");
    if (lower.includes("colony limit reached")) return t("expedition.error.colonyLimit");
    if (lower.includes("already colonized")) return t("expedition.error.alreadyColonized");
    if (lower.includes("not discovered")) return t("expedition.error.notDiscovered");
    if (lower.includes("protected home")) return t("expedition.error.protectedHome");
    if (lower.includes("jump drive research")) return t("expedition.error.jumpDriveRequired");
    if (lower.includes("jump gate calibration")) return t("expedition.error.jumpGateCalibrating");
    if (lower.includes("known destination")) return t("expedition.error.knownDestination");
    if (lower.includes("already surveyed")) return t("expedition.error.alreadySurveyed");
    return message.includes("_") ? t("expedition.error.unknown") : message;
  };

  const selectRouteMode = (nextRouteMode: ExpeditionRouteMode) => {
    setRouteMode(nextRouteMode);
    setTargetPlanetId(null);
    setLaunchError(null);
  };

  const handleLaunch = async () => {
    setLaunchError(null);
    try {
      await launch.mutateAsync({
        shipId: ship.id,
        routeMode,
        targetX: routeTarget.x,
        targetY: routeTarget.y,
        targetZ: routeTarget.z,
        destinationSystemId:
          routeMode === "jump_gate" ? selectedDestination?.systemId : undefined,
        cargoLoaded: cargo,
        targetPlanetId: targetPlanetId ?? undefined,
      });
      onClose();
    } catch (err) {
      const apiError = err as Error & { data?: { code?: string; details?: unknown } };
      const message = err instanceof Error ? err.message : t("expedition.error.unknown");
      setLaunchError(formatLaunchError(message, apiError.data?.code, apiError.data?.details));
    }
  };

  const onPickSectorDelta = useCallback(
    (dx: number, dy: number) => {
      if (routeMode !== "local" || isColonizer) return;
      const nextX = originX + dx;
      const nextY = originY + dy;
      setTarget((prev) => {
        if (
          Math.abs(prev.x - nextX) < 0.03 &&
          Math.abs(prev.y - nextY) < 0.03 &&
          prev.z === originZ
        ) {
          return prev;
        }
        return {
          ...prev,
          x: nextX,
          y: nextY,
          z: originZ,
        };
      });
    },
    [originX, originY, originZ, isColonizer, routeMode],
  );

  const onPickPlanet = useCallback(
    (planetId: string) => {
      if (routeMode !== "local" || !isColonizer) return;
      const planet = colonizationTargets.find(
        (candidate) => candidate.id === planetId,
      );
      if (!planet || !homeSystem) return;
      setTargetPlanetId(planet.id);
      setLaunchError(null);
      setTarget({
        x: homeSystem.sectorX,
        y: homeSystem.sectorY,
        z: homeSystem.sectorZ,
      });
    },
    [isColonizer, colonizationTargets, homeSystem, routeMode],
  );

  const sectorDx = routeTarget.x - originX;
  const sectorDy = routeTarget.y - originY;

  const expeditionPick = useMemo<ExpeditionPickConfig | undefined>(
    () =>
      routeMode === "local" && ship.locationPlanetId && homeSystem
        ? {
            sectorDx,
            sectorDy,
            launchPlanetId: ship.locationPlanetId,
            targetPlanetId: targetPlanetId,
            onPickSectorDelta,
            onPickPlanet: isColonizer ? onPickPlanet : undefined,
          }
        : undefined,
    [
      homeSystem,
      isColonizer,
      onPickPlanet,
      onPickSectorDelta,
      routeMode,
      sectorDx,
      sectorDy,
      ship.locationPlanetId,
      targetPlanetId,
    ],
  );

  return (
    <div
      className="animate-in fade-in duration-200"
      style={{
        position: "fixed",
        inset: 0,
        /* Above `.bnav` (z-index 1000) and build-dialog sheets (1110); see `index.css` */
        zIndex: 1200,
        display: "flex",
        flexDirection: "column",
        background: "rgba(6, 10, 18, 0.94)",
        backdropFilter: "blur(10px)",
        paddingTop: "max(10px, env(safe-area-inset-top, 10px))",
        paddingBottom: "max(12px, env(safe-area-inset-bottom, 0px))",
        paddingLeft: "max(12px, env(safe-area-inset-left, 12px))",
        paddingRight: "max(12px, env(safe-area-inset-right, 12px))",
        height: "100dvh",
        maxHeight: "100dvh",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 8,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 12,
            alignItems: "center",
            minWidth: 0,
          }}
        >
          <ShipIconBadge
            typeId={ship.typeId}
            status={ship.status}
            size={36}
            title={shipType.name[locale]}
          />
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: 17,
                color: "var(--text)",
              }}
            >
              {t("expedition.title")}
            </div>
            <div
              style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}
            >
              {shipType.name[locale]}{" "}
              <span style={{ fontFamily: "var(--font-mono)", opacity: 0.75 }}>
                · {getShipClassTag(ship.typeId, locale)}
              </span>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("common.close")}
          style={{
            padding: 10,
            borderRadius: 999,
            border: "1px solid var(--line)",
            background: "rgba(14, 20, 36, 0.85)",
            color: "var(--text-dim)",
          }}
        >
          <X size={20} />
        </button>
      </div>

      {/* Single map: same system view as Galaxy — tap from star sets sector jump; trail from your planet */}
      <div
        style={{
          flex: "1 1 50%",
          minHeight: 160,
          position: "relative",
          borderRadius: 16,
          overflow: "hidden",
          border: "1px solid var(--line)",
        }}
      >
        <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
          <CosmicBackground accent="#5BD7FF" starSeed={11} />
        </div>
        {homeSystem ? (
          <div style={{ position: "absolute", inset: 0, zIndex: 1 }}>
            <CosmicSystemRenderer
              system={homeSystem}
              ships={meData?.ships ?? []}
              expeditions={meData?.expeditions ?? []}
              onPlanetClick={() => {}}
              ownedPlanetIds={ownedPlanetIds}
              expeditionPick={expeditionPick}
            />
          </div>
        ) : (
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 1,
              display: "grid",
              placeItems: "center",
              color: "var(--text-dim)",
              fontSize: 13,
            }}
          >
            {t("expedition.loadingSystem")}
          </div>
        )}
      </div>

      <div
        style={{
          flex: "0 1 auto",
          maxHeight: "42%",
          overflowY: "auto",
          marginTop: 10,
          paddingBottom: 4,
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: "var(--text-dim)",
            marginBottom: 10,
            lineHeight: 1.45,
          }}
        >
          <strong style={{ color: "var(--text)" }}>
            {isColonizer
              ? t("expedition.selectTarget")
              : t("expedition.pickRoute")}
          </strong>{" "}
          —{" "}
          {isColonizer
            ? t("expedition.selectTargetHelp")
            : t("expedition.pickRouteHelp")}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: supportsJumpGateExpedition
              ? "repeat(2, minmax(0, 1fr))"
              : "minmax(0, 1fr)",
            gap: 8,
            marginBottom: 10,
          }}
        >
          {(supportsJumpGateExpedition
            ? (["local", "jump_gate"] as ExpeditionRouteMode[])
            : (["local"] as ExpeditionRouteMode[])
          ).map((mode) => {
            const active = routeMode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => selectRouteMode(mode)}
                style={{
                  minHeight: 38,
                  borderRadius: 10,
                  border: active
                    ? "1px solid var(--accent)"
                    : "1px solid var(--line)",
                  background: active
                    ? "rgba(91,215,255,0.16)"
                    : "rgba(8,12,22,0.78)",
                  color: active ? "var(--accent)" : "var(--text-dim)",
                  fontSize: 12,
                  fontWeight: 800,
                }}
              >
                {mode === "local"
                  ? t("expedition.routeLocal")
                  : t("expedition.routeJumpGate")}
              </button>
            );
          })}
        </div>

        {routeMode === "jump_gate" ? (
          <div
            style={{
              border: "1px solid var(--line)",
              borderRadius: 14,
              background: "rgba(8,12,22,0.72)",
              padding: 12,
              marginBottom: 12,
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: "var(--text-dim)",
                lineHeight: 1.4,
              }}
            >
              <strong style={{ color: "var(--text)" }}>
                {t("jumpGate.title")}
              </strong>{" "}
              - {jumpGateStatusText}
            </div>
            {knownDestinations.length > 0 ? (
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  overflowX: "auto",
                  marginTop: 10,
                  paddingBottom: 2,
                }}
              >
                {knownDestinations.map((destination) => {
                  const active =
                    selectedDestination?.systemId === destination.systemId;
                  return (
                    <button
                      key={destination.systemId}
                      type="button"
                      onClick={() => {
                        setSelectedDestinationSystemId(destination.systemId);
                        setTargetPlanetId(null);
                      }}
                      style={{
                        flex: "0 0 170px",
                        textAlign: "left",
                        borderRadius: 10,
                        border: active
                          ? "1px solid var(--accent)"
                          : "1px solid var(--line)",
                        background: active
                          ? "rgba(91,215,255,0.13)"
                          : "rgba(14,20,36,0.76)",
                        color: "var(--text)",
                        padding: "8px 10px",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 800,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {destination.systemName}
                      </div>
                      <div
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 9,
                          color: "var(--text-faint)",
                          marginTop: 4,
                        }}
                      >
                        [{destination.sector.x}, {destination.sector.y},{" "}
                        {destination.sector.z}]
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          color: "var(--text-dim)",
                          marginTop: 4,
                        }}
                      >
                        {t("expedition.planetCount", {
                          count: destination.planetCount,
                        })}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : null}
            {selectedDestination ? (
              <div style={{ marginTop: 10 }}>
                <div
                  style={{
                    fontSize: 10,
                    color: "var(--text-faint)",
                    marginBottom: 6,
                    fontWeight: 700,
                  }}
                >
                  {t(
                    isColonizer
                      ? "expedition.gateColonizerTargets"
                      : "expedition.gateSurveyTargets",
                  ).toUpperCase()}
                </div>
                {selectableJumpPlanets.length > 0 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {selectableJumpPlanets.map((planet) => {
                      const active = targetPlanetId === planet.id;
                      const disabled =
                        isColonizer &&
                        (!planet.isDiscovered || planet.isColonized);
                      return (
                        <button
                          key={planet.id}
                          type="button"
                          disabled={disabled}
                          onClick={() =>
                            {
                              setTargetPlanetId(active ? null : planet.id);
                              setLaunchError(null);
                            }
                          }
                          style={{
                            borderRadius: 999,
                            border: active
                              ? "1px solid var(--accent)"
                              : "1px solid rgba(148,163,184,0.25)",
                            background: active
                              ? "rgba(91,215,255,0.14)"
                              : "rgba(14,20,36,0.7)",
                            color: disabled
                              ? "var(--text-faint)"
                              : active
                                ? "var(--accent)"
                                : "var(--text-dim)",
                            padding: "6px 9px",
                            fontSize: 11,
                            cursor: disabled ? "not-allowed" : "pointer",
                          }}
                        >
                          {jumpPlanetLabel(planet)}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                    {isColonizer
                      ? t("expedition.noGateColonizerTargets")
                      : t("expedition.noGateSurveyTargets")}
                  </div>
                )}
                {selectedJumpTargetPlanet?.isOwnedColony ? (
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 11,
                      color: "var(--text-dim)",
                    }}
                  >
                    {t("expedition.ownedColonyTarget")}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid var(--line)",
              background: "rgba(14,20,36,0.75)",
              flex: "1 1 auto",
              minWidth: 200,
            }}
          >
            <span
              style={{
                color: "var(--text-faint)",
                letterSpacing: "0.12em",
                fontSize: 9,
              }}
            >
              {t("expedition.targetSector").toUpperCase()}
            </span>
            <div style={{ color: "var(--accent)", marginTop: 4 }}>
              [{routeTarget.x}, {routeTarget.y}, {routeTarget.z}]
            </div>
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid var(--line)",
              background: "rgba(14,20,36,0.75)",
              flex: "1 1 auto",
              minWidth: 160,
            }}
          >
            <span
              style={{
                color: "var(--text-faint)",
                letterSpacing: "0.12em",
                fontSize: 9,
              }}
            >
              {t("expedition.deltaFromHome").toUpperCase()}
            </span>
            <div style={{ color: "var(--text)", marginTop: 4 }}>
              [{sectorDx >= 0 ? "+" : ""}
              {sectorDx}, {sectorDy >= 0 ? "+" : ""}
              {sectorDy}]
            </div>
          </div>
        </div>

        <div
          style={{
            padding: 14,
            borderRadius: 16,
            border: "1px solid var(--line)",
            background: "rgba(10,14,26,0.75)",
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.18em",
              color: "var(--text-faint)",
              marginBottom: 12,
              fontWeight: 700,
            }}
          >
            {t("expedition.summary").toUpperCase()}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  color: "var(--text-dim)",
                  fontSize: 13,
                }}
              >
                <Box size={16} style={{ opacity: 0.85 }} />{" "}
                {t("expedition.distance")}
              </div>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontWeight: 700,
                  fontSize: 16,
                }}
              >
                {effectiveDistance.toFixed(1)}{" "}
                <span style={{ fontSize: 11, color: "var(--text-faint)" }}>
                  ly
                </span>
              </span>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  color: "var(--text-dim)",
                  fontSize: 13,
                }}
              >
                <Timer size={16} style={{ opacity: 0.85 }} />{" "}
                {t("expedition.oneWayEta")}
              </div>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontWeight: 700,
                  fontSize: 16,
                  color: "#fbbf24",
                }}
              >
                {Math.floor(etaSeconds / 60)}m {etaSeconds % 60}s
              </span>
            </div>
            <div
              style={{
                borderTop: "1px solid rgba(148,163,184,0.12)",
                paddingTop: 14,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    color: "var(--text-dim)",
                    fontSize: 13,
                  }}
                >
                  <Fuel size={16} style={{ opacity: 0.85 }} />{" "}
                  {t("expedition.fuel")} (
                  {preview.returnTrip
                    ? t("expedition.roundTrip")
                    : t("expedition.oneWay")}{" "}
                  {t("expedition.estimate")})
                </div>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontWeight: 700,
                    fontSize: 16,
                    color: "#6ee7b7",
                  }}
                >
                  {recommendedFuel}{" "}
                  <span style={{ fontSize: 11, color: "var(--text-faint)" }}>
                    / {fuelAvailable} {t("expedition.availableShort")}
                  </span>
                </span>
              </div>
              {routeMode === "jump_gate" ? (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                    marginTop: 12,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      color: "var(--text-dim)",
                      fontSize: 13,
                    }}
                  >
                    <Navigation size={16} style={{ opacity: 0.85 }} />{" "}
                    {t("expedition.jumpFuel")}
                  </div>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontWeight: 700,
                      fontSize: 16,
                      color: shortOnJumpFuel ? "#fcd34d" : "#93c5fd",
                    }}
                  >
                    {jumpFuelRequired}{" "}
                    <span style={{ fontSize: 11, color: "var(--text-faint)" }}>
                      / {jumpFuelAvailable} {t("expedition.availableShort")}
                    </span>
                  </span>
                </div>
              ) : null}
              <div
                style={{
                  marginTop: 8,
                  fontSize: 11,
                  color: "var(--text-dim)",
                  lineHeight: 1.45,
                }}
              >
                {t("expedition.requiredFuel", {
                  fuel: recommendedFuel,
                  legs: preview.returnTrip ? 2 : 1,
                  distance: effectiveDistance.toFixed(1),
                  consumption: Number(shipType.fuelConsumption).toFixed(2),
                })}
              </div>
              {shortOnFuel ? (
                <div
                  style={{
                    marginTop: 10,
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-start",
                    padding: 10,
                    borderRadius: 12,
                    background: "rgba(251, 191, 36, 0.08)",
                    border: "1px solid rgba(251, 191, 36, 0.35)",
                    color: "#fcd34d",
                    fontSize: 12,
                  }}
                >
                  <AlertTriangle
                    size={18}
                    style={{ flexShrink: 0, marginTop: 2 }}
                  />
                  <span>{t("expedition.shortFuel")}</span>
                </div>
              ) : null}
              {shortOnJumpFuel ? (
                <div
                  style={{
                    marginTop: 10,
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-start",
                    padding: 10,
                    borderRadius: 12,
                    background: "rgba(251, 191, 36, 0.08)",
                    border: "1px solid rgba(251, 191, 36, 0.35)",
                    color: "#fcd34d",
                    fontSize: 12,
                  }}
                >
                  <AlertTriangle
                    size={18}
                    style={{ flexShrink: 0, marginTop: 2 }}
                  />
                  <span>{t("expedition.shortJumpFuel")}</span>
                </div>
              ) : null}
              {colonizationPreflightMessage ? (
                <div
                  style={{
                    marginTop: 10,
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-start",
                    padding: 10,
                    borderRadius: 12,
                    background: "rgba(251, 191, 36, 0.08)",
                    border: "1px solid rgba(251, 191, 36, 0.35)",
                    color: "#fcd34d",
                    fontSize: 12,
                    lineHeight: 1.45,
                  }}
                >
                  <AlertTriangle
                    size={18}
                    style={{ flexShrink: 0, marginTop: 2 }}
                  />
                  <span>{colonizationPreflightMessage}</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleLaunch}
          disabled={launch.isPending || launchBlocked}
          style={{
            width: "100%",
            marginTop: 12,
            padding: "14px 16px",
            borderRadius: 16,
            border: "none",
            fontWeight: 800,
            fontSize: 15,
            cursor:
              launch.isPending || launchBlocked ? "not-allowed" : "pointer",
            background: launchBlocked
              ? "rgba(51,65,85,0.6)"
              : "linear-gradient(135deg, #2563eb, #4f46e5)",
            color: launchBlocked ? "var(--text-faint)" : "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            boxShadow: launchBlocked
              ? "none"
              : "0 12px 28px rgba(37,99,235,0.35)",
          }}
        >
          {launch.isPending ? (
            t("expedition.preparing")
          ) : isColonizer && !targetPlanetId ? (
            <>
              <Target size={20} /> {t("expedition.selectPlanet").toUpperCase()}
            </>
          ) : colonizationPreflightPending ? (
            <>
              <Target size={20} />{" "}
              {t("expedition.checkingColonizationShort").toUpperCase()}
            </>
          ) : colonizationGateBlocked ? (
            <>
              <Target size={20} />{" "}
              {t("expedition.colonizationBlockedButton").toUpperCase()}
            </>
          ) : jumpGateBlocked ? (
            <>
              <Target size={20} />{" "}
              {t("expedition.jumpGateUnavailable").toUpperCase()}
            </>
          ) : launchBlocked ? (
            <>
              <Target size={20} />{" "}
              {t("expedition.insufficientFuel").toUpperCase()}
            </>
          ) : (
            <>
              <Send size={20} /> {t("expedition.commence").toUpperCase()}
            </>
          )}
        </button>
        {launchError ? (
          <div
            role="alert"
            style={{
              marginTop: 10,
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
              padding: 10,
              borderRadius: 12,
              background: "rgba(248, 113, 113, 0.1)",
              border: "1px solid rgba(248, 113, 113, 0.35)",
              color: "#fecaca",
              fontSize: 12,
              lineHeight: 1.45,
            }}
          >
            <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{launchError}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
