import type { Ship, ShipType } from "@shared/types/ships";
import {
  formatLaunchExpeditionErrorMessage,
  type Expedition,
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
import { useSystemTacticalState } from "../hooks/useSystemTacticalState";
import {
  X,
  Send,
  Fuel,
  Box,
  Timer,
  Target,
  AlertTriangle,
  Zap,
} from "lucide-react";
import { useState, useMemo, useCallback, useEffect } from "react";
import { CosmicBackground } from "./cosmic/atoms";
import {
  CosmicSystemRenderer,
  type ExpeditionPickConfig,
} from "./cosmic/SystemMap";
import { getShipClassTag, ShipIconBadge } from "./cosmic/ships";
import { useI18n } from "../lib/i18n";
import { buildExpeditionPreview } from "../lib/expedition-routing";
import { ResourceAmount } from "./cosmic/resources";
import {
  buildSystemMapLayouts,
  systemMapJumpGatePoint,
  systemMapPlanetDistanceLy,
  systemMapPointDistanceLy,
  type SystemMapPoint,
} from "@shared/format/systemMapLayout";
import {
  formatCommonSystemDisplayName,
  homeSystemShortTag,
  type HomeNamingLocale,
} from "@shared/format/homeSystemNaming";
import type { HomeSystem, Planet } from "@shared/types/world";

interface ExpeditionDialogProps {
  ship: Ship;
  shipType: ShipType;
  originX: number;
  originY: number;
  originZ: number;
  initialRouteMode?: ExpeditionRouteMode;
  initialDestinationSystemId?: string | null;
  stationedExpedition?: Expedition | null;
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

function destinationToSystem(
  destination: JumpGateKnownDestinationSummary,
  locale: string,
): HomeSystem {
  const namingLocale: HomeNamingLocale = locale === "ru" ? "ru" : "en";
  const systemName = formatCommonSystemDisplayName(
    namingLocale,
    destination.shortTag ?? homeSystemShortTag(destination.systemId),
  );
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
      resources: planet.resources ?? [],
    }));

  return {
    id: destination.systemId,
    ownerId: "",
    isHome: false,
    sectorX: destination.sector.x,
    sectorY: destination.sector.y,
    sectorZ: destination.sector.z,
    name: systemName,
    seed: destination.seed,
    planets,
  };
}

function pointFromUnknown(value: unknown): SystemMapPoint | null {
  if (!value || typeof value !== "object") return null;
  const point = value as Record<string, unknown>;
  return typeof point.x === "number" && typeof point.y === "number"
    ? { x: point.x, y: point.y }
    : null;
}

export function ExpeditionDialog({
  ship,
  shipType,
  originX,
  originY,
  originZ,
  initialRouteMode,
  initialDestinationSystemId,
  stationedExpedition,
  onClose,
}: ExpeditionDialogProps) {
  const { data: meData } = useMe();
  const { data: jumpGateState, isLoading: jumpGateLoading } =
    useJumpGateState();
  const { locale, t } = useI18n();
  const stationedResult =
    stationedExpedition?.result &&
    typeof stationedExpedition.result === "object"
      ? (stationedExpedition.result as Record<string, unknown>)
      : null;
  const stationedOriginSystemId =
    typeof stationedResult?.destinationSystemId === "string"
      ? stationedResult.destinationSystemId
      : null;
  const stationedOriginPoint = pointFromUnknown(stationedResult?.targetSystemPoint);
  const isStationedOrigin = Boolean(
    stationedExpedition && stationedOriginSystemId && stationedOriginPoint,
  );
  const [routeMode, setRouteMode] = useState<ExpeditionRouteMode>(
    isStationedOrigin ? "jump_gate" : (initialRouteMode ?? "local"),
  );
  const [target, setTarget] = useState({
    x: originX + 10,
    y: originY + 10,
    z: originZ,
  });
  const [targetPlanetId, setTargetPlanetId] = useState<string | null>(null);
  const [selectedDestinationSystemId, setSelectedDestinationSystemId] =
    useState<string | null>(
      initialDestinationSystemId ?? stationedOriginSystemId ?? null,
    );
  const [jumpTargetPoints, setJumpTargetPoints] = useState<Record<string, SystemMapPoint>>({});
  const [fuelLoaded, setFuelLoaded] = useState(0);
  const [jumpFuelLoaded, setJumpFuelLoaded] = useState(0);
  const [cargo] = useState(0);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const launch = useLaunchExpedition();

  const homeSystem = meData?.homeSystem;
  const isColonizer =
    shipType.role === "colonization" || ship.typeId === "colonizer";
  const supportsJumpGateExpedition = shipType.role !== "logistics";
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
  const selectedDestinationSystem = useMemo(
    () => (selectedDestination ? destinationToSystem(selectedDestination, locale) : null),
    [locale, selectedDestination],
  );
  const selectedJumpTargetPoint = selectedDestination
    ? jumpTargetPoints[selectedDestination.systemId] ?? null
    : null;
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
  const renderedSystem =
    routeMode === "jump_gate" && selectedDestinationSystem
      ? selectedDestinationSystem
      : homeSystem;
  const { data: tacticalState } = useSystemTacticalState(
    routeMode === "jump_gate" ? renderedSystem?.id : null,
  );
  const sameStationedDestination =
    isStationedOrigin &&
    selectedDestination?.systemId === stationedOriginSystemId;
  const colonizationEligibility = useQuery({
    queryKey: ["colonization-eligibility", targetPlanetId, routeMode],
    queryFn: () =>
      apiFetch<ColonizationEligibilityResponse>(
        `/colonies/eligibility/${targetPlanetId}${
          routeMode === "jump_gate" ? "?routeMode=jump_gate" : ""
        }`,
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

  const jumpGatePoint = useMemo(() => systemMapJumpGatePoint(), []);
  const originGateDistance = useMemo(() => {
    if (routeMode === "jump_gate" && isStationedOrigin && stationedOriginPoint) {
      return sameStationedDestination
        ? 0
        : systemMapPointDistanceLy(stationedOriginPoint, jumpGatePoint);
    }

    if (routeMode !== "jump_gate" || !homeSystem?.planets || !ship.locationPlanetId) {
      return null;
    }

    const launchLayout = buildSystemMapLayouts(
      homeSystem.planets,
      Number(homeSystem.seed),
    ).find((layout) => layout.id === ship.locationPlanetId);
    return launchLayout ? systemMapPointDistanceLy(launchLayout, jumpGatePoint) : null;
  }, [
    homeSystem?.planets,
    homeSystem?.seed,
    isStationedOrigin,
    jumpGatePoint,
    routeMode,
    sameStationedDestination,
    ship.locationPlanetId,
    stationedOriginPoint,
  ]);

  const targetGateDistance = useMemo(() => {
    if (routeMode !== "jump_gate" || !selectedDestinationSystem) return null;
    if (selectedJumpTargetPlanet) {
      const targetLayout = buildSystemMapLayouts(
        selectedDestinationSystem.planets ?? [],
        Number(selectedDestinationSystem.seed),
      ).find((layout) => layout.id === selectedJumpTargetPlanet.id);
      if (sameStationedDestination && stationedOriginPoint) {
        return targetLayout
          ? systemMapPointDistanceLy(stationedOriginPoint, targetLayout)
          : null;
      }
      return targetLayout ? systemMapPointDistanceLy(jumpGatePoint, targetLayout) : null;
    }
    if (selectedJumpTargetPoint) {
      if (sameStationedDestination && stationedOriginPoint) {
        return systemMapPointDistanceLy(stationedOriginPoint, selectedJumpTargetPoint);
      }
      return systemMapPointDistanceLy(jumpGatePoint, selectedJumpTargetPoint);
    }
    return null;
  }, [
    jumpGatePoint,
    routeMode,
    sameStationedDestination,
    selectedDestinationSystem,
    selectedJumpTargetPlanet,
    selectedJumpTargetPoint,
    stationedOriginPoint,
  ]);

  const jumpGateRouteDistance =
    routeMode === "jump_gate" && targetGateDistance !== null
      ? (originGateDistance ?? 0) + targetGateDistance
      : null;

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
        jumpGateRouteDistance,
        jumpFuelRequiredOverride: sameStationedDestination ? 0 : undefined,
        hasTargetPlanet: Boolean(targetPlanetId),
        isColonizer,
        shipRole: shipType.role,
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
      sameStationedDestination,
      jumpGateRouteDistance,
      shipType.fuelConsumption,
      shipType.role,
      shipType.speed,
      targetPlanetId,
    ],
  );

  const effectiveDistance = preview.distance;
  const etaSeconds = preview.etaSeconds;
  const recommendedFuel = preview.fuelRequired;
  const jumpFuelRequired = preview.jumpFuelRequired;

  const currentFuel = Number(ship.fuel);
  const currentJumpFuel = Number(ship.jumpFuel);
  const fuelLoadMax = Math.max(
    0,
    Math.floor(
      Math.min(fuelAvailable, Math.max(0, shipType.fuelCapacity - currentFuel)),
    ),
  );
  const fuelLoadMin = Math.min(
    fuelLoadMax,
    Math.max(0, Math.ceil(recommendedFuel - currentFuel)),
  );
  const jumpFuelLoadMax = Math.max(
    0,
    Math.floor(
      Math.min(
        jumpFuelAvailable,
        Math.max(0, shipType.jumpFuelCapacity - currentJumpFuel),
      ),
    ),
  );
  const jumpFuelLoadMin = Math.min(
    jumpFuelLoadMax,
    Math.max(0, Math.ceil(jumpFuelRequired - currentJumpFuel)),
  );

  useEffect(() => {
    setFuelLoaded((value) =>
      Math.min(fuelLoadMax, Math.max(fuelLoadMin, value)),
    );
  }, [fuelLoadMax, fuelLoadMin]);

  useEffect(() => {
    setJumpFuelLoaded((value) =>
      Math.min(jumpFuelLoadMax, Math.max(jumpFuelLoadMin, value)),
    );
  }, [jumpFuelLoadMax, jumpFuelLoadMin]);

  const clampedFuelLoaded = Math.min(
    fuelLoadMax,
    Math.max(fuelLoadMin, fuelLoaded),
  );
  const clampedJumpFuelLoaded = Math.min(
    jumpFuelLoadMax,
    Math.max(jumpFuelLoadMin, jumpFuelLoaded),
  );

  const totalFuelAtLaunch = currentFuel + clampedFuelLoaded;
  const totalJumpFuelAtLaunch = currentJumpFuel + clampedJumpFuelLoaded;

  const shortOnFuel = totalFuelAtLaunch < recommendedFuel;
  const shortOnJumpFuel =
    routeMode === "jump_gate" && totalJumpFuelAtLaunch < jumpFuelRequired;
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
    shortOnFuel ||
    shortOnJumpFuel ||
    colonizationPreflightPending ||
    colonizationGateBlocked ||
    jumpGateBlocked ||
    (routeMode === "jump_gate" && !isColonizer && !targetPlanetId && !selectedJumpTargetPoint) ||
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
    if (isStationedOrigin && nextRouteMode !== "jump_gate") return;
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
        targetSystemX:
          routeMode === "jump_gate" && selectedJumpTargetPoint && !targetPlanetId
            ? selectedJumpTargetPoint.x
            : undefined,
        targetSystemY:
          routeMode === "jump_gate" && selectedJumpTargetPoint && !targetPlanetId
            ? selectedJumpTargetPoint.y
            : undefined,
        destinationSystemId:
          routeMode === "jump_gate" ? selectedDestination?.systemId : undefined,
        fuelLoaded: clampedFuelLoaded > 0 ? clampedFuelLoaded : undefined,
        jumpFuelLoaded: clampedJumpFuelLoaded > 0 ? clampedJumpFuelLoaded : undefined,
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

  const onPickJumpPlanet = useCallback(
    (planetId: string) => {
      if (routeMode !== "jump_gate" || !isColonizer) return;
      const planet = jumpColonizationTargets.find(
        (candidate) => candidate.id === planetId,
      );
      if (!planet) return;
      setTargetPlanetId(planet.id);
      setLaunchError(null);
    },
    [isColonizer, jumpColonizationTargets, routeMode],
  );

  const onPickJumpSystemPoint = useCallback(
    (point: SystemMapPoint) => {
      if (routeMode !== "jump_gate" || isColonizer || !selectedDestination) return;
      setJumpTargetPoints((current) => ({
        ...current,
        [selectedDestination.systemId]: point,
      }));
      setTargetPlanetId(null);
      setLaunchError(null);
    },
    [isColonizer, routeMode, selectedDestination],
  );

  const sectorDx = routeTarget.x - originX;
  const sectorDy = routeTarget.y - originY;

  const expeditionPick = useMemo<ExpeditionPickConfig | undefined>(
    () => {
      if (routeMode === "jump_gate" && selectedDestinationSystem) {
        const routeStartPoint =
          sameStationedDestination && stationedOriginPoint
            ? stationedOriginPoint
            : jumpGatePoint;
        return {
          sectorDx: selectedJumpTargetPoint
            ? selectedJumpTargetPoint.x - routeStartPoint.x
            : 0,
          sectorDy: selectedJumpTargetPoint
            ? selectedJumpTargetPoint.y - routeStartPoint.y
            : 0,
          routeStartPoint,
          targetPoint: isColonizer ? null : selectedJumpTargetPoint,
          targetPlanetId,
          onPickSectorDelta: () => {},
          onPickPlanet: isColonizer ? onPickJumpPlanet : undefined,
          onPickSystemPoint: isColonizer ? undefined : onPickJumpSystemPoint,
        };
      }

      return routeMode === "local" && ship.locationPlanetId && homeSystem
        ? {
            sectorDx,
            sectorDy,
            launchPlanetId: ship.locationPlanetId,
            targetPlanetId: targetPlanetId,
            onPickSectorDelta,
            onPickPlanet: isColonizer ? onPickPlanet : undefined,
          }
        : undefined;
    },
    [
      homeSystem,
      isColonizer,
      jumpGatePoint,
      onPickJumpSystemPoint,
      onPickJumpPlanet,
      onPickPlanet,
      onPickSectorDelta,
      routeMode,
      sameStationedDestination,
      sectorDx,
      sectorDy,
      selectedDestinationSystem,
      selectedJumpTargetPoint,
      ship.locationPlanetId,
      stationedOriginPoint,
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
        {renderedSystem ? (
          <div style={{ position: "absolute", inset: 0, zIndex: 1 }}>
            <CosmicSystemRenderer
              system={renderedSystem}
              ships={meData?.ships ?? []}
              shipTypes={[shipType]}
              expeditions={meData?.expeditions ?? []}
              fleetContacts={
                routeMode === "jump_gate" && tacticalState?.systemId === renderedSystem.id
                  ? tacticalState.fleetContacts
                  : []
              }
              fleetContactsAuthoritative={
                routeMode === "jump_gate" &&
                tacticalState?.systemId === renderedSystem.id
              }
              onPlanetClick={() => {}}
              ownedPlanetIds={ownedPlanetIds}
              expeditionPick={expeditionPick}
              jumpGate={
                routeMode === "jump_gate"
                  ? {
                      unlocked: true,
                      statusLabel: t("jumpGate.destination.portal"),
                      onClick: () => {},
                      position: jumpGatePoint,
                    }
                  : undefined
              }
              minimumOrbitCount={
                routeMode === "jump_gate" ? selectedDestination?.planetCount : undefined
              }
              showOrbitRings={true}
              emptyStateLabel={routeMode === "jump_gate" ? null : undefined}
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
            {routeMode === "jump_gate" && !isColonizer
              ? t("expedition.pickGatePoint")
              : isColonizer
              ? t("expedition.selectTarget")
              : t("expedition.pickRoute")}
          </strong>{" "}
          —{" "}
          {routeMode === "jump_gate" && !isColonizer
            ? t("expedition.pickGatePointHelp")
            : isColonizer
            ? t("expedition.selectTargetHelp")
            : t("expedition.pickRouteHelp")}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: supportsJumpGateExpedition && !isStationedOrigin
              ? "repeat(2, minmax(0, 1fr))"
              : "minmax(0, 1fr)",
            gap: 8,
            marginBottom: 10,
          }}
        >
          {(isStationedOrigin
            ? (["jump_gate"] as ExpeditionRouteMode[])
            : supportsJumpGateExpedition
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
                  const namingLocale: HomeNamingLocale = locale === "ru" ? "ru" : "en";
                  const systemName = formatCommonSystemDisplayName(
                    namingLocale,
                    destination.shortTag ?? homeSystemShortTag(destination.systemId),
                  );
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
                        {systemName}
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
                {isColonizer ? (
                  jumpColonizationTargets.length > 0 ? (
                    <div
                      style={{
                        fontSize: 11,
                        color: selectedJumpTargetPlanet
                          ? "var(--accent)"
                          : "var(--text-dim)",
                      }}
                    >
                      {selectedJumpTargetPlanet
                        ? t("expedition.gatePlanetSelected", {
                            planet: jumpPlanetLabel(selectedJumpTargetPlanet),
                          })
                        : t("expedition.gatePlanetRequired")}
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                      {t("expedition.noGateColonizerTargets")}
                    </div>
                  )
                ) : (
                  <div style={{ fontSize: 11, color: selectedJumpTargetPoint ? "var(--accent)" : "var(--text-dim)" }}>
                    {selectedJumpTargetPoint
                      ? t("expedition.gatePointSelected", {
                          x: selectedJumpTargetPoint.x.toFixed(0),
                          y: selectedJumpTargetPoint.y.toFixed(0),
                        })
                      : t("expedition.gatePointRequired")}
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
                  {t("expedition.fuelRequired")}
                </div>
                <div style={{ textAlign: "right" }}>
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontWeight: 700,
                      fontSize: 16,
                    }}
                  >
                    <ResourceAmount resourceId="fuel" amount={preview.fuelRequired} locale={locale} />
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--text-faint)",
                      marginTop: 2,
                    }}
                  >
                    {t("expedition_dialog_tank_status", {
                      current: currentFuel.toFixed(0),
                      capacity: shipType.fuelCapacity,
                    })}
                  </div>
                </div>
              </div>

              {/* Ordinary Fuel Loading Slider */}
              <div style={{ marginTop: 4 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                   <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{t("expedition_dialog_load_fuel")}</div>
                   <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--accent)" }}>+{clampedFuelLoaded}</div>
                </div>
                <input 
                  type="range"
                  className="cosmic-range"
                  min={fuelLoadMin}
                  max={fuelLoadMax}
                  value={clampedFuelLoaded}
                  onChange={(e) => setFuelLoaded(Number(e.target.value))}
                />
              </div>

              {preview.jumpFuelRequired > 0 && (
                <>
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
                      <Zap size={16} style={{ opacity: 0.85 }} />{" "}
                      {t("expedition.jumpFuelRequired")}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontWeight: 700,
                          fontSize: 16,
                        }}
                      >
                        <ResourceAmount resourceId="jump_fuel" amount={preview.jumpFuelRequired} locale={locale} />
                      </div>
                      <div
                        style={{
                          fontSize: 10,
                          color: "var(--text-faint)",
                          marginTop: 2,
                        }}
                      >
                        {t("expedition_dialog_tank_status", {
                          current: currentJumpFuel.toFixed(0),
                          capacity: shipType.jumpFuelCapacity,
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Jump Fuel Loading Slider */}
                  <div style={{ marginTop: 4 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                       <div style={{ fontSize: 11, color: "var(--text-dim)" }}>{t("expedition_dialog_load_jump_fuel")}</div>
                       <div style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--accent)" }}>+{clampedJumpFuelLoaded}</div>
                    </div>
                    <input 
                      type="range"
                      className="cosmic-range"
                      min={jumpFuelLoadMin}
                      max={jumpFuelLoadMax}
                      value={clampedJumpFuelLoaded}
                      onChange={(e) => setJumpFuelLoaded(Number(e.target.value))}
                    />
                  </div>
                </>
              )}

              <div
                style={{
                  marginTop: 12,
                  fontSize: 11,
                  color: "var(--text-dim)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>{t("expedition.availableOnPlanet")}</span>
                  <span className="resource-amount-list">
                    <ResourceAmount resourceId="fuel" amount={fuelAvailable} iconSize={12} locale={locale} />
                    <span className="resource-amount-sep">·</span>
                    <ResourceAmount resourceId="jump_fuel" amount={jumpFuelAvailable} iconSize={12} locale={locale} />
                  </span>
                </div>
              </div>
              </div>

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
          ) : routeMode === "jump_gate" && !isColonizer && !targetPlanetId && !selectedJumpTargetPoint ? (
            <>
              <Target size={20} /> {t("expedition.selectGatePoint").toUpperCase()}
            </>
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
  );
}
