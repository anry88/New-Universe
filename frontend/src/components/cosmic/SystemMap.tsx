/**
 * Cosmic Atlas system map.
 *
 * Renders the home system as a top-down orbital diagram using the same biome
 * SVG sprites as the rest of the app — no schematic blue circles, no PixiJS
 * raster.
 *
 * Layout strategy (this is the second iteration — the first one relied on
 * `position: absolute; left/top: 50%` and broke when the parent flex
 * container measured 0px tall):
 *  - The outer container fills the parent with `position: absolute; inset: 0`
 *    so we get a deterministic frame even if the flex parent has weird
 *    height.
 *  - Inside it we use a flex column with `align-items / justify-content:
 *    center` to anchor the world wrapper at the visual center.
 *  - The world wrapper is a 0×0 box that holds absolutely-positioned
 *    children (the sun, orbit rings, planets, ships, expedition trails) at
 *    their world coordinates. Because flex centering already places the
 *    wrapper in the middle of the screen, planets at world coords (cos·r,
 *    sin·r) end up symmetrically around the centre of the viewport.
 *  - Pan/zoom is a single CSS `transform` on the world wrapper.
 *
 * This works regardless of how the parent measures, scrolls, or resizes.
 */
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Fuel, Package, RadioTower, Send, Shield, X } from "lucide-react";
import type { HomeSystem, Planet } from "@shared/types/world";
import type { Ship, ShipType } from "@shared/types/ships";
import type { Expedition } from "@shared/types/expeditions";
import type { SystemTacticalFleetContact } from "@shared/types/system-tactical";
import {
  missilePayloadSustainedDps,
  type CombatStats,
  type DamageType,
  type EngagementRange,
} from "@shared/types/combat";
import {
  buildSystemMapLayouts,
  buildSystemMapOrbitGuideRadii,
  sectorDeltaToSystemMapPoint,
  systemMapJumpGatePoint,
  SYSTEM_MAP_WORLD_UNITS_PER_LY,
  type SystemMapPoint,
} from "@shared/format/systemMapLayout";
import { BIOME_META, PlanetSvg, getBiomeTag, resolveBiome } from "./planets";
import { SunSvg } from "./sun";
import { FoundColonyDialog } from "../FoundColonyDialog";
import { ShieldStatus } from "../ShieldStatus";
import { isCargoTransferShipType } from "../../lib/fleet";
import { useI18n } from "../../lib/i18n";
import { isShipReadyForOrders } from "../../lib/ship-queue";
import { getResourceLabel, ResourceIcon } from "./resources";
import { getShipLabel, ShipIcon, ShipIconBadge } from "./ships";

/** When set, the map is used to pick a sector jump vector from the home star: tap = set course, drag = pan. */
export interface ExpeditionPickConfig {
  /** Sector delta from home (X/Y galactic grid). */
  sectorDx: number;
  sectorDy: number;
  /** Trail starts at this planet (launch site). */
  launchPlanetId?: string;
  /** Alternative trail start for routes that begin at a system object such as a Jump Gate. */
  routeStartPoint?: SystemMapPoint;
  /** Absolute target point in the currently rendered system map. */
  targetPoint?: SystemMapPoint | null;
  /** Set when targeting a specific local body (e.g. for Survey or Colonize). */
  targetPlanetId?: string | null;
  /** World-map pixels per sector light-year along the aim ray (tuning for comfortable reach). */
  worldUnitsPerLy?: number;
  onPickSectorDelta: (dx: number, dy: number) => void;
  onPickSystemPoint?: (point: SystemMapPoint) => void;
  onPickPlanet?: (planetId: string) => void;
}

interface CosmicSystemRendererProps {
  system: HomeSystem;
  ships: Ship[];
  shipTypes?: ShipType[];
  expeditions: Expedition[];
  fleetContacts?: SystemTacticalFleetContact[];
  fleetContactsAuthoritative?: boolean;
  onPlanetClick: (planet: Planet) => void;
  onColonizeClick?: (planet: Planet) => void;
  ownedPlanetIds: Set<string>;
  expeditionPick?: ExpeditionPickConfig;
  jumpGate?: JumpGateMarkerConfig | null;
  minimumOrbitCount?: number;
  emptyStateLabel?: string | null;
  showOrbitRings?: boolean;
  onOwnShipAction?: (
    ship: Ship,
    shipType: ShipType | null,
    expedition: Expedition | null,
  ) => void;
}

export interface PlanetLayout {
  planet: Planet;
  index: number;
  orbitRadius: number;
  angle: number;
  x: number;
  y: number;
  spriteSize: number;
}

interface JumpGateMarkerConfig {
  unlocked: boolean;
  statusLabel: string;
  onClick: () => void;
  position?: SystemMapPoint;
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 5;
const DISPLAY_SCALE_FACTOR = 0.3;
const SHIP_MARKER_TICK_MS = 2500;
const RECENT_COMBAT_WINDOW_MS = 30_000;
const PICK_DELTA_EPSILON = 0.03;
const ACTIVE_MAP_EXPEDITION_STATUSES = new Set([
  "in_flight",
  "returning",
  "stationed",
]);
const COMBAT_PROJECTILE_LIMIT = 6;
const MIN_COMBAT_PROJECTILE_LENGTH = 24;
const CLOSE_COMBAT_PROJECTILE_LENGTH = 36;

/** Below this drag distance (CSS px), a one-finger gesture counts as a tap for expedition aiming. */
const EXPEDITION_TAP_THRESHOLD_PX = 14;

type MapShipSelection =
  | { kind: "own"; id: string }
  | { kind: "foreign"; id: string };

type WeaponVisualKind =
  | "kinetic"
  | "beam"
  | "missile"
  | "thermal"
  | "shield"
  | "neutral";

interface ShipMarkerSnapshot {
  ship: Ship;
  x: number;
  y: number;
  angle: number;
  isMoving: boolean;
  isReturning: boolean;
  isInCombat: boolean;
  tone: string;
  weaponKind: WeaponVisualKind;
}

interface CombatProjectileSegment {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: WeaponVisualKind;
  delayMs: number;
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function isDiscoveredPlanet(planet: Planet): boolean {
  return planet.isDiscovered !== false;
}

function timestamp(value?: string | null): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function isRecentCombat(
  value: string | null | undefined,
  now: number,
): boolean {
  const lastCombatMs = timestamp(value);
  return lastCombatMs != null && now - lastCombatMs <= RECENT_COMBAT_WINDOW_MS;
}

function hpPercent(hp: number | undefined, maxHp: number | undefined): number {
  const max = Math.max(0, maxHp ?? 0);
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, ((hp ?? 0) / max) * 100));
}

function hpTone(percent: number): string {
  if (percent <= 25) return "#ef4444";
  if (percent <= 60) return "#fcd34d";
  return "#5BFFA9";
}

export function weaponVisualForCombatStats(
  stats: CombatStats | null | undefined,
): WeaponVisualKind {
  if (stats?.missilePayload) return "missile";
  const damageType = stats?.damageProfile?.damageType as DamageType | undefined;
  if (damageType === "energy") return "beam";
  if (damageType === "explosive") return "missile";
  if (damageType === "thermal") return "thermal";
  if (damageType === "kinetic") return "kinetic";
  if (stats?.shields) return "shield";
  return "neutral";
}

function weaponTone(kind: WeaponVisualKind): string {
  switch (kind) {
    case "beam":
      return "#60a5fa";
    case "missile":
      return "#f97316";
    case "thermal":
      return "#fb7185";
    case "shield":
      return "#38bdf8";
    case "kinetic":
      return "#facc15";
    default:
      return "#cbd5e1";
  }
}

export function isPlanetOwnedByViewer(
  planet: Pick<Planet, "id" | "isOwnedColony">,
  ownedPlanetIds: ReadonlySet<string>,
): boolean {
  return planet.isOwnedColony === true || ownedPlanetIds.has(planet.id);
}

export function isForeignColonizedPlanet(
  planet: Pick<Planet, "id" | "isColonized" | "isOwnedColony">,
  ownedPlanetIds: ReadonlySet<string>,
): boolean {
  return planet.isColonized === true && !isPlanetOwnedByViewer(planet, ownedPlanetIds);
}

function combatDps(stats: CombatStats | null | undefined): number {
  return Math.round(
    Math.max(
      0,
      Number(stats?.damageProfile?.dps ?? 0) +
        missilePayloadSustainedDps(stats?.missilePayload),
    ),
  );
}

function rangeLabelKey(range: EngagementRange | undefined): string | null {
  return range ? `ships.range.${range}` : null;
}

function clientToWorldCoords(
  container: HTMLElement,
  transform: { x: number; y: number; scale: number },
  clientX: number,
  clientY: number,
): { wx: number; wy: number } {
  const rect = container.getBoundingClientRect();
  const sx = clientX - rect.left - rect.width / 2;
  const sy = clientY - rect.top - rect.height / 2;
  const wx = (sx - transform.x) / transform.scale;
  const wy = (sy - transform.y) / transform.scale;
  return { wx, wy };
}

function worldRayToSectorDelta(
  wx: number,
  wy: number,
  originX: number,
  originY: number,
  worldUnitsPerLy: number,
): { dx: number; dy: number } {
  const dxw = wx - originX;
  const dyw = wy - originY;
  const angle = Math.atan2(dyw, dxw);
  let r = Math.hypot(dxw, dyw);
  const MIN_WORLD = 40;
  if (r < MIN_WORLD) r = MIN_WORLD;
  const ly = r / worldUnitsPerLy;
  const dist = Math.max(0.1, ly);
  return {
    dx: dist * Math.cos(angle),
    dy: dist * Math.sin(angle),
  };
}

interface RouteLineProps {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  thickness: number;
  dash: number;
  gap: number;
  opacity: number;
  zIndex?: number;
  testId?: string;
}

const RouteLine = React.memo(function RouteLine({
  x1,
  y1,
  x2,
  y2,
  color,
  thickness,
  dash,
  gap,
  opacity,
  zIndex = 1,
  testId,
}: RouteLineProps) {
  const length = Math.hypot(x2 - x1, y2 - y1);
  if (length < 1) return null;

  return (
    <div
      data-testid={testId}
      style={{
        position: "absolute",
        left: x1,
        top: y1 - thickness / 2,
        width: length,
        height: thickness,
        transform: `rotate(${Math.atan2(y2 - y1, x2 - x1)}rad)`,
        transformOrigin: "0 50%",
        background: `repeating-linear-gradient(90deg, ${color} 0 ${dash}px, transparent ${dash}px ${
          dash + gap
        }px)`,
        opacity,
        pointerEvents: "none",
        zIndex,
      }}
    />
  );
});

interface ExpeditionTrailSegment {
  id: string;
  originX: number;
  originY: number;
  endpointX: number;
  endpointY: number;
}

function isActiveMapExpedition(expedition: Expedition): boolean {
  return ACTIVE_MAP_EXPEDITION_STATUSES.has(expedition.status);
}

export function tacticalExpeditionTouchesSystem(
  expedition: Expedition,
  systemId: string,
): boolean {
  const result = expedition.result as Record<string, unknown> | null | undefined;
  if (result?.routeMode !== "jump_gate") return false;
  const destinationSystemId =
    typeof result.destinationSystemId === "string"
      ? result.destinationSystemId
      : null;
  const originSystemId =
    typeof result.originSystemId === "string" ? result.originSystemId : null;
  return destinationSystemId === systemId || originSystemId === systemId;
}

function pointFromResult(value: unknown): SystemMapPoint | null {
  if (!value || typeof value !== "object") return null;
  const point = value as { x?: unknown; y?: unknown };
  return typeof point.x === "number" && typeof point.y === "number"
    ? { x: point.x, y: point.y }
    : null;
}

export function buildExpeditionTrailSegments(
  activeExpeditions: Expedition[],
  layoutByPlanetId: Map<string, PlanetLayout>,
  system: HomeSystem,
): ExpeditionTrailSegment[] {
  return activeExpeditions.flatMap((exp) => {
    if (exp.status === "stationed") return [];

    const result = exp.result as Record<string, unknown> | null | undefined;
    if (result?.routeMode === "jump_gate") {
      const originSystemId =
        typeof result.originSystemId === "string"
          ? result.originSystemId
          : null;
      const originSystemPoint = pointFromResult(result.originSystemPoint);
      if (result.destinationSystemId === system.id) {
        const gatePoint = systemMapJumpGatePoint();
        const routeStart =
          originSystemId === system.id && originSystemPoint
            ? originSystemPoint
            : gatePoint;
        const targetPlanet = exp.targetPlanetId
          ? layoutByPlanetId.get(exp.targetPlanetId)
          : null;
        const targetPoint =
          targetPlanet ?? pointFromResult(result.targetSystemPoint);
        if (!targetPoint) return [];

        return [
          {
            id: `${exp.id}-destination`,
            originX: routeStart.x,
            originY: routeStart.y,
            endpointX: targetPoint.x,
            endpointY: targetPoint.y,
          },
        ];
      }

      if (originSystemId === system.id && originSystemPoint) {
        const gatePoint = systemMapJumpGatePoint();
        return [
          {
            id: `${exp.id}-origin`,
            originX: originSystemPoint.x,
            originY: originSystemPoint.y,
            endpointX: gatePoint.x,
            endpointY: gatePoint.y,
          },
        ];
      }
    }

    const origin = layoutByPlanetId.get(exp.originPlanetId);
    if (!origin) return [];

    const targetPlanet = exp.targetPlanetId
      ? layoutByPlanetId.get(exp.targetPlanetId)
      : null;
    const endpoint = targetPlanet
      ? { x: targetPlanet.x, y: targetPlanet.y }
      : result?.routeMode === "jump_gate"
        ? systemMapJumpGatePoint()
        : sectorDeltaToSystemMapPoint(
            { x: origin.x, y: origin.y },
            Number(exp.targetX) - system.sectorX,
            Number(exp.targetY) - system.sectorY,
          );

    return [
      {
        id: exp.id,
        originX: origin.x,
        originY: origin.y,
        endpointX: endpoint.x,
        endpointY: endpoint.y,
      },
    ];
  });
}

export function fleetContactsForSystem(
  contacts: SystemTacticalFleetContact[],
  systemId: string,
): SystemTacticalFleetContact[] {
  return contacts.filter((contact) => contact.systemId === systemId);
}

export function tacticalExpeditionShipIdsForRenderedContacts({
  activeExpeditions,
  visibleFleetContacts,
  fleetContactsAuthoritative,
  systemId,
}: {
  activeExpeditions: Expedition[];
  visibleFleetContacts: SystemTacticalFleetContact[];
  fleetContactsAuthoritative?: boolean;
  systemId: string;
}): Set<string> {
  if (!fleetContactsAuthoritative) return new Set();
  const renderedContactShipIds = new Set(
    visibleFleetContacts.map((contact) => contact.id),
  );
  return new Set(
    activeExpeditions
      .filter(
        (expedition) =>
          renderedContactShipIds.has(expedition.shipId) &&
          tacticalExpeditionTouchesSystem(expedition, systemId),
      )
      .map((expedition) => expedition.shipId),
  );
}

export function fleetContactMotionAngle(
  contact: Pick<SystemTacticalFleetContact, "motion">,
): number | null {
  const motion = contact.motion;
  if (!motion || Math.hypot(motion.dx, motion.dy) < 0.01) return null;
  return Math.atan2(motion.dy, motion.dx);
}

export function buildFleetContactRenderPoints(
  contacts: SystemTacticalFleetContact[],
): Map<string, SystemMapPoint> {
  const pointTotals = new Map<string, number>();
  for (const contact of contacts) {
    const key = `${contact.point.x}:${contact.point.y}`;
    pointTotals.set(key, (pointTotals.get(key) ?? 0) + 1);
  }

  const pointSeen = new Map<string, number>();
  const renderPoints = new Map<string, SystemMapPoint>();
  for (const contact of contacts) {
    const pointKey = `${contact.point.x}:${contact.point.y}`;
    const totalAtPoint = pointTotals.get(pointKey) ?? 1;
    const indexAtPoint = pointSeen.get(pointKey) ?? 0;
    pointSeen.set(pointKey, indexAtPoint + 1);
    const spread =
      totalAtPoint > 1 ? Math.min(22, 8 + totalAtPoint * 2) : 0;
    const spreadAngle =
      (Math.PI * 2 * indexAtPoint) / totalAtPoint - Math.PI / 2;
    renderPoints.set(contact.id, {
      x: contact.point.x + Math.cos(spreadAngle) * spread,
      y: contact.point.y + Math.sin(spreadAngle) * spread,
    });
  }

  return renderPoints;
}

function contactRenderPoint(
  contact: SystemTacticalFleetContact,
  renderPoints: Map<string, SystemMapPoint>,
): SystemMapPoint {
  return renderPoints.get(contact.id) ?? contact.point;
}

const ExpeditionTrailLayer = React.memo(function ExpeditionTrailLayer({
  segments,
}: {
  segments: ExpeditionTrailSegment[];
}) {
  return (
    <>
      {segments.map((segment) => (
        <RouteLine
          key={segment.id}
          x1={segment.originX}
          y1={segment.originY}
          x2={segment.endpointX}
          y2={segment.endpointY}
          color="#F4B84A"
          thickness={1.4}
          dash={6}
          gap={6}
          opacity={0.55}
          testId={`expedition-trail-${segment.id}`}
        />
      ))}
    </>
  );
});

const OrbitRings = React.memo(function OrbitRings({
  orbitRadii,
  isPicking,
}: {
  orbitRadii: number[];
  isPicking: boolean;
}) {
  return (
    <>
      {orbitRadii.map((orbitRadius) => (
        <div
          key={`orbit-${orbitRadius}`}
          style={{
            position: "absolute",
            left: -orbitRadius,
            top: -orbitRadius,
            width: orbitRadius * 2,
            height: orbitRadius * 2,
            border: "1.5px solid rgba(150,175,220,0.22)",
            borderRadius: "50%",
            pointerEvents: isPicking ? "none" : "auto",
          }}
        />
      ))}
    </>
  );
});

interface PlanetMarkersProps {
  layouts: PlanetLayout[];
  selectedId: string | null;
  pickedTargetPlanetId?: string | null;
  ownedPlanetIds: ReadonlySet<string>;
  canPickPlanet: boolean;
  isPicking: boolean;
  onPickPlanet?: (planetId: string) => void;
  onSelectPlanet: (planetId: string) => void;
}

const PlanetMarkers = React.memo(function PlanetMarkers({
  layouts,
  selectedId,
  pickedTargetPlanetId,
  ownedPlanetIds,
  canPickPlanet,
  isPicking,
  onPickPlanet,
  onSelectPlanet,
}: PlanetMarkersProps) {
  return (
    <>
      {layouts.map((l) => {
        const biome = resolveBiome(l.planet.biome);
        const meta = BIOME_META[biome];
        const isSelected =
          l.planet.id === selectedId || pickedTargetPlanetId === l.planet.id;
        const isForeignColony = isForeignColonizedPlanet(
          l.planet,
          ownedPlanetIds,
        );

        return (
          <button
            key={l.planet.id}
            type="button"
            data-testid={`planet-btn-${l.planet.id}`}
            onClick={(e) => {
              e.stopPropagation();
              if (canPickPlanet && onPickPlanet) {
                onPickPlanet(l.planet.id);
                return;
              }
              onSelectPlanet(l.planet.id);
            }}
            style={{
              position: "absolute",
              left: l.x - l.spriteSize / 2,
              top: l.y - l.spriteSize / 2,
              width: l.spriteSize,
              height: l.spriteSize,
              background: "transparent",
              border: 0,
              padding: 0,
              cursor: canPickPlanet
                ? "pointer"
                : isPicking
                  ? "inherit"
                  : "pointer",
              pointerEvents: canPickPlanet
                ? "auto"
                : isPicking
                  ? "none"
                  : "auto",
              filter: isForeignColony
                ? "drop-shadow(0 0 14px rgba(239,68,68,0.74))"
                : isSelected
                  ? `drop-shadow(0 0 10px ${meta.accent})`
                  : "drop-shadow(0 6px 14px rgba(0,0,0,0.5))",
            }}
          >
            {isForeignColony ? (
              <span
                data-testid={`planet-hostile-colony-ring-${l.planet.id}`}
                style={{
                  position: "absolute",
                  inset: -5,
                  border: "3px solid rgba(239,68,68,0.92)",
                  borderRadius: "50%",
                  boxShadow:
                    "0 0 18px rgba(239,68,68,0.52), inset 0 0 12px rgba(239,68,68,0.22)",
                  pointerEvents: "none",
                }}
              />
            ) : null}
            <PlanetSvg
              biome={biome}
              size={l.spriteSize}
              uid={`map-${l.planet.id}`}
            />
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: "50%",
                transform: "translate(-50%, 4px)",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                letterSpacing: "0.1em",
                color: isForeignColony
                  ? "#fca5a5"
                  : isSelected
                    ? meta.accent
                    : "var(--text-dim)",
                whiteSpace: "nowrap",
                pointerEvents: "none",
                textShadow: "0 1px 2px rgba(0,0,0,0.8)",
              }}
            >
              {(l.planet.name || "?").toUpperCase()}
            </div>
          </button>
        );
      })}
    </>
  );
});

function routeProgress(
  exp: Expedition,
  now: number,
): {
  totalDistance: number;
  outboundTravelled: number;
  returnTravelled: number;
} | null {
  const res = exp.result as Record<string, number> | null | undefined;
  if (!res || res.distance === undefined || !res.speed) return null;
  const totalDistance = Number(res.distance);
  const durationMs =
    ((totalDistance * 60) / Number(res.speed)) *
    Number(res.engineFactor || 1) *
    1000;
  if (!Number.isFinite(durationMs) || durationMs <= 0) return null;

  if (exp.status === "stationed") {
    return {
      totalDistance,
      outboundTravelled: totalDistance,
      returnTravelled: 0,
    };
  }

  const etaMs = new Date(exp.eta).getTime();
  const startMs = etaMs - durationMs;
  const progress = Math.max(0, Math.min(1, (now - startMs) / durationMs));
  const remaining = Math.max(0, Math.min(1, (etaMs - now) / durationMs));
  return {
    totalDistance,
    outboundTravelled: progress * totalDistance,
    returnTravelled: (1 - remaining) * totalDistance,
  };
}

function interpolatePoint(
  start: SystemMapPoint,
  end: SystemMapPoint,
  progress: number,
): SystemMapPoint {
  const p = Math.max(0, Math.min(1, progress));
  return {
    x: start.x + (end.x - start.x) * p,
    y: start.y + (end.y - start.y) * p,
  };
}

function jumpGateShipPointForSystem({
  exp,
  layout,
  layoutByPlanetId,
  system,
  now,
}: {
  exp: Expedition;
  layout: PlanetLayout | null;
  layoutByPlanetId: Map<string, PlanetLayout>;
  system: HomeSystem;
  now: number;
}): { point: SystemMapPoint; angle: number; returning: boolean } | null {
  const result = exp.result as Record<string, unknown> | null | undefined;
  if (!result || result.routeMode !== "jump_gate") return null;
  const destinationSystemId =
    typeof result.destinationSystemId === "string"
      ? result.destinationSystemId
      : null;
  const originSystemId =
    typeof result.originSystemId === "string" ? result.originSystemId : null;
  const originSystemPoint = pointFromResult(result.originSystemPoint);
  const progress = routeProgress(exp, now);
  if (!progress) return null;

  const gatePoint = systemMapJumpGatePoint();
  const isDestinationSystem = destinationSystemId === system.id;
  const isOriginSystem = originSystemId === system.id;

  if (isDestinationSystem) {
    const targetPlanet = exp.targetPlanetId
      ? layoutByPlanetId.get(exp.targetPlanetId)
      : null;
    const routeEnd = targetPlanet ?? pointFromResult(result.targetSystemPoint);
    if (!routeEnd) return null;
    const routeStart =
      isOriginSystem && originSystemPoint ? originSystemPoint : gatePoint;

    const targetLegDistance = Number(result.targetGateDistance ?? 0);
    if (exp.status === "stationed") {
      return {
        point: routeEnd,
        angle: Math.atan2(routeEnd.y - routeStart.y, routeEnd.x - routeStart.x),
        returning: false,
      };
    }
    if (!Number.isFinite(targetLegDistance) || targetLegDistance <= 0)
      return null;

    if (exp.status === "returning") {
      const legProgress = 1 - progress.returnTravelled / targetLegDistance;
      if (legProgress <= 0 || legProgress > 1) return null;
      const point = interpolatePoint(routeStart, routeEnd, legProgress);
      return {
        point,
        angle: Math.atan2(routeStart.y - routeEnd.y, routeStart.x - routeEnd.x),
        returning: true,
      };
    }

    const originLegDistance = Number(result.originGateDistance ?? 0);
    const legProgress =
      (progress.outboundTravelled - originLegDistance) / targetLegDistance;
    if (legProgress <= 0 || legProgress > 1) return null;
    const point = interpolatePoint(routeStart, routeEnd, legProgress);
    return {
      point,
      angle: Math.atan2(routeEnd.y - routeStart.y, routeEnd.x - routeStart.x),
      returning: false,
    };
  }

  if (exp.status === "stationed") return null;

  const originLegDistance = Number(result.originGateDistance ?? 0);
  if (!Number.isFinite(originLegDistance) || originLegDistance <= 0)
    return null;

  if (isOriginSystem && originSystemPoint) {
    const legProgress = progress.outboundTravelled / originLegDistance;
    if (legProgress < 0 || legProgress > 1) return null;
    const point = interpolatePoint(originSystemPoint, gatePoint, legProgress);
    return {
      point,
      angle: Math.atan2(
        gatePoint.y - originSystemPoint.y,
        gatePoint.x - originSystemPoint.x,
      ),
      returning: false,
    };
  }

  if (!layout) return null;

  if (exp.status === "returning") {
    const originLegStart = Math.max(
      0,
      progress.totalDistance - originLegDistance,
    );
    const legProgress =
      (progress.returnTravelled - originLegStart) / originLegDistance;
    if (legProgress <= 0 || legProgress > 1) return null;
    const point = interpolatePoint(gatePoint, layout, legProgress);
    return {
      point,
      angle: Math.atan2(layout.y - gatePoint.y, layout.x - gatePoint.x),
      returning: true,
    };
  }

  const legProgress = progress.outboundTravelled / originLegDistance;
  if (legProgress < 0 || legProgress > 1) return null;
  const point = interpolatePoint(layout, gatePoint, legProgress);
  return {
    point,
    angle: Math.atan2(gatePoint.y - layout.y, gatePoint.x - layout.x),
    returning: false,
  };
}

function parkedShipPoint(
  layout: PlanetLayout,
  shipIdx: number,
): { x: number; y: number; angle: number } {
  const dockRadius = Math.min(14, Math.max(5, layout.spriteSize * 0.24));
  const a = layout.angle + 0.18 + shipIdx * 0.74;
  return {
    x: layout.x + Math.cos(a) * dockRadius,
    y: layout.y + Math.sin(a) * dockRadius,
    angle: a + Math.PI / 2,
  };
}

export function buildShipMarkerSnapshots({
  ships,
  activeExpeditions,
  layoutByPlanetId,
  system,
  now,
}: {
  ships: Ship[];
  activeExpeditions: Expedition[];
  layoutByPlanetId: Map<string, PlanetLayout>;
  system: HomeSystem;
  now: number;
}): ShipMarkerSnapshot[] {
  const expeditionByShipId = new Map(
    activeExpeditions.map((exp) => [exp.shipId, exp]),
  );

  return ships.flatMap((ship, shipIdx) => {
    if (!["idle", "moving"].includes(ship.status)) return [];

    // For moving ships the location_planet_id is cleared at launch — fall
    // back to the active expedition's origin so the marker still renders
    // along its route instead of vanishing from the map.
    const movingExpedition =
      ship.status === "moving" ? expeditionByShipId.get(ship.id) : undefined;
    const anchorPlanetId =
      ship.locationPlanetId ?? movingExpedition?.originPlanetId ?? null;
    const layout = anchorPlanetId
      ? (layoutByPlanetId.get(anchorPlanetId) ?? null)
      : null;

    let sx: number | undefined;
    let sy: number | undefined;
    let angle = 0;
    let isMoving = false;
    let isReturning = false;

    if (ship.status === "moving") {
      const exp = movingExpedition;
      if (exp && exp.result && typeof exp.result === "object") {
        const res = exp.result as Record<string, number>;
        if ((exp.result as Record<string, unknown>).routeMode === "jump_gate") {
          const gatePoint = jumpGateShipPointForSystem({
            exp,
            layout,
            layoutByPlanetId,
            system,
            now,
          });
          if (!gatePoint) return [];
          sx = gatePoint.point.x;
          sy = gatePoint.point.y;
          angle = gatePoint.angle;
          isReturning = gatePoint.returning;
          isMoving = exp.status !== "stationed";
        } else if (!layout) {
          return [];
        } else {
          const targetPlanet = exp.targetPlanetId
            ? layoutByPlanetId.get(exp.targetPlanetId)
            : null;
          const resultRouteMode = (
            exp.result as Record<string, unknown> | null | undefined
          )?.routeMode;
          let endX: number;
          let endY: number;
          if (targetPlanet) {
            endX = targetPlanet.x;
            endY = targetPlanet.y;
          } else if (resultRouteMode === "jump_gate") {
            const gatePoint = systemMapJumpGatePoint();
            endX = gatePoint.x;
            endY = gatePoint.y;
          } else {
            const endpoint = sectorDeltaToSystemMapPoint(
              { x: layout.x, y: layout.y },
              Number(exp.targetX) - system.sectorX,
              Number(exp.targetY) - system.sectorY,
            );
            endX = endpoint.x;
            endY = endpoint.y;
          }

          const targetAngle = Math.atan2(endY - layout.y, endX - layout.x);

          if (exp.status === "stationed") {
            if (targetPlanet) {
              const parked = parkedShipPoint(targetPlanet, shipIdx);
              sx = parked.x;
              sy = parked.y;
              angle = parked.angle;
            } else {
              sx = endX;
              sy = endY;
              angle = targetAngle;
            }
            isMoving = false;
          } else if (res.distance !== undefined && res.speed) {
            const durationMs =
              ((res.distance * 60) / res.speed) *
              (res.engineFactor || 1) *
              1000;
            const etaMs = new Date(exp.eta).getTime();
            let progress = 0;
            if (exp.status === "in_flight") {
              progress = 1 - (etaMs - now) / durationMs;
            } else {
              progress = (etaMs - now) / durationMs;
              isReturning = true;
            }
            progress = Math.max(0, Math.min(1, progress));

            sx = layout.x + (endX - layout.x) * progress;
            sy = layout.y + (endY - layout.y) * progress;

            angle = targetAngle + (isReturning ? Math.PI : 0);
            isMoving = true;
          }
        }
      }
    }

    if (sx === undefined || sy === undefined) {
      if (!layout && sx === undefined && sy === undefined) return [];
      if (!layout) {
        angle = angle || 0;
      } else {
        const parked = parkedShipPoint(layout, shipIdx);
        sx = parked.x;
        sy = parked.y;
        angle = parked.angle;
      }
    }

    const isInCombat = isRecentCombat(ship.lastCombatTickAt, now);
    const tone = isInCombat
      ? "#EF4444"
      : isMoving
        ? isReturning
          ? "#F4B84A"
          : "#5BD7FF"
        : "#5BFFA9";

    if (sx === undefined || sy === undefined) return [];

    return [
      {
        ship,
        x: sx,
        y: sy,
        angle,
        isMoving,
        isReturning,
        isInCombat,
        tone,
        weaponKind: weaponVisualForCombatStats(ship.combatStats),
      },
    ];
  });
}

function ShipHealthBar({
  hp,
  maxHp,
  isForeign = false,
}: {
  hp: number | undefined;
  maxHp: number | undefined;
  isForeign?: boolean;
}) {
  const pct = hpPercent(hp, maxHp);
  if (pct <= 0 && (maxHp ?? 0) <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        bottom: -8,
        width: 34,
        height: 4,
        transform: "translateX(-50%)",
        borderRadius: 999,
        overflow: "hidden",
        background: isForeign ? "rgba(127,29,29,0.62)" : "rgba(15,23,42,0.75)",
        border: "1px solid rgba(255,255,255,0.18)",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: "100%",
          background: hpTone(pct),
          boxShadow: `0 0 8px ${hpTone(pct)}`,
        }}
      />
    </div>
  );
}

const ShipMarkers = React.memo(function ShipMarkers({
  markers,
  isPicking,
  selectedShipId,
  onSelectShip,
}: {
  markers: ShipMarkerSnapshot[];
  isPicking: boolean;
  selectedShipId: string | null;
  onSelectShip: (shipId: string) => void;
}) {
  return (
    <>
      {markers.map((marker) => {
        const isSelected = selectedShipId === marker.ship.id;

        return (
          <button
            key={marker.ship.id}
            type="button"
            data-testid={`map-ship-${marker.ship.id}`}
            onClick={(e) => {
              e.stopPropagation();
              onSelectShip(marker.ship.id);
            }}
            style={{
              position: "absolute",
              left: marker.x - 14,
              top: marker.y - 14,
              width: 28,
              height: 28,
              color: marker.tone,
              boxSizing: "border-box",
              filter: marker.isInCombat
                ? "drop-shadow(0 0 10px rgba(239,68,68,0.86))"
                : marker.isMoving
                  ? "drop-shadow(0 0 7px currentColor)"
                  : "drop-shadow(0 0 4px rgba(91,255,169,0.4))",
              pointerEvents: isPicking ? "none" : "auto",
              transition: marker.isMoving
                ? `left ${SHIP_MARKER_TICK_MS}ms linear, top ${SHIP_MARKER_TICK_MS}ms linear`
                : "none",
              border: isSelected
                ? "1px solid currentColor"
                : "1px solid transparent",
              borderRadius: 8,
              background: isSelected ? "rgba(8,12,22,0.78)" : "transparent",
              padding: 2,
              cursor: isPicking ? "inherit" : "pointer",
              zIndex: marker.isInCombat ? 7 : 5,
            }}
          >
            <span
              style={{
                display: "grid",
                placeItems: "center",
                transform: `rotate(${marker.angle}rad)`,
              }}
            >
              <ShipIcon
                typeId={marker.ship.typeId}
                size={24}
                tone="currentColor"
              />
            </span>
            {marker.ship.combatStats?.shields && (
              <div
                style={{
                  position: "absolute",
                  right: -4,
                  top: -4,
                  filter: "drop-shadow(0 0 4px #60a5fa)",
                }}
              >
                <Shield size={10} color="#60a5fa" />
              </div>
            )}
            <ShipHealthBar hp={marker.ship.hp} maxHp={marker.ship.maxHp} />
          </button>
        );
      })}
    </>
  );
});

function nearestContactForMarker(
  marker: ShipMarkerSnapshot,
  contacts: SystemTacticalFleetContact[],
  contactPoints: Map<string, SystemMapPoint>,
): SystemTacticalFleetContact | null {
  let best: SystemTacticalFleetContact | null = null;
  let bestDistance = Infinity;
  for (const contact of contacts) {
    if (contact.relation === "self") continue;
    const point = contactRenderPoint(contact, contactPoints);
    const dist = Math.hypot(marker.x - point.x, marker.y - point.y);
    if (dist < bestDistance) {
      best = contact;
      bestDistance = dist;
    }
  }
  return best;
}

function nearestMarkerForContact(
  contact: SystemTacticalFleetContact,
  markers: ShipMarkerSnapshot[],
  contactPoints: Map<string, SystemMapPoint>,
): ShipMarkerSnapshot | null {
  let best: ShipMarkerSnapshot | null = null;
  let bestDistance = Infinity;
  const point = contactRenderPoint(contact, contactPoints);
  for (const marker of markers) {
    const dist = Math.hypot(marker.x - point.x, marker.y - point.y);
    if (dist < bestDistance) {
      best = marker;
      bestDistance = dist;
    }
  }
  return best;
}

function nearestContactForContact(
  contact: SystemTacticalFleetContact,
  contacts: SystemTacticalFleetContact[],
  contactPoints: Map<string, SystemMapPoint>,
): SystemTacticalFleetContact | null {
  let best: SystemTacticalFleetContact | null = null;
  let bestDistance = Infinity;
  const point = contactRenderPoint(contact, contactPoints);
  for (const candidate of contacts) {
    if (candidate.id === contact.id) continue;
    if (candidate.relation === "self" && contact.relation === "self") {
      continue;
    }
    if (
      candidate.ownerAlias &&
      contact.ownerAlias &&
      candidate.ownerAlias === contact.ownerAlias
    ) {
      continue;
    }
    const candidatePoint = contactRenderPoint(candidate, contactPoints);
    const dist = Math.hypot(
      point.x - candidatePoint.x,
      point.y - candidatePoint.y,
    );
    if (dist < bestDistance) {
      best = candidate;
      bestDistance = dist;
    }
  }
  return best;
}

function normalizeCombatProjectileSegment(
  segment: CombatProjectileSegment,
): CombatProjectileSegment {
  const dx = segment.x2 - segment.x1;
  const dy = segment.y2 - segment.y1;
  const length = Math.hypot(dx, dy);
  if (length >= MIN_COMBAT_PROJECTILE_LENGTH) return segment;

  const angle =
    length > 0.01
      ? Math.atan2(dy, dx)
      : (hashString(segment.id) % 360) * (Math.PI / 180);
  const cx = (segment.x1 + segment.x2) / 2;
  const cy = (segment.y1 + segment.y2) / 2;
  const halfLength = CLOSE_COMBAT_PROJECTILE_LENGTH / 2;
  return {
    ...segment,
    x1: cx - Math.cos(angle) * halfLength,
    y1: cy - Math.sin(angle) * halfLength,
    x2: cx + Math.cos(angle) * halfLength,
    y2: cy + Math.sin(angle) * halfLength,
  };
}

export function buildCombatProjectileSegments({
  markers,
  contacts,
  now,
}: {
  markers: ShipMarkerSnapshot[];
  contacts: SystemTacticalFleetContact[];
  now: number;
}): CombatProjectileSegment[] {
  const segments: CombatProjectileSegment[] = [];
  const contactPoints = buildFleetContactRenderPoints(contacts);
  const combatMarkers = markers.filter((marker) => marker.isInCombat);
  const combatContacts = contacts.filter((contact) =>
    isRecentCombat(contact.lastCombatTickAt, now),
  );

  combatMarkers.forEach((marker, index) => {
    const contact = nearestContactForMarker(marker, contacts, contactPoints);
    if (!contact) return;
    const contactPoint = contactRenderPoint(contact, contactPoints);
    segments.push({
      id: `own-${marker.ship.id}-${contact.id}`,
      x1: marker.x,
      y1: marker.y,
      x2: contactPoint.x,
      y2: contactPoint.y,
      kind: marker.weaponKind,
      delayMs: index * 130,
    });
  });

  combatContacts.forEach((contact, index) => {
    const contactPoint = contactRenderPoint(contact, contactPoints);
    const marker =
      contact.relation === "foreign"
        ? nearestMarkerForContact(contact, markers, contactPoints)
        : null;
    if (marker) {
      segments.push({
        id: `foreign-${contact.id}-${marker.ship.id}`,
        x1: contactPoint.x,
        y1: contactPoint.y,
        x2: marker.x,
        y2: marker.y,
        kind: weaponVisualForCombatStats(contact.combatStats),
        delayMs: 90 + index * 150,
      });
      return;
    }

    const target = nearestContactForContact(
      contact,
      combatContacts,
      contactPoints,
    );
    if (!target) return;
    const targetPoint = contactRenderPoint(target, contactPoints);
    const relationPrefix = contact.relation === "self" ? "self" : "foreign";
    segments.push({
      id: `${relationPrefix}-${contact.id}-${target.id}`,
      x1: contactPoint.x,
      y1: contactPoint.y,
      x2: targetPoint.x,
      y2: targetPoint.y,
      kind: weaponVisualForCombatStats(contact.combatStats),
      delayMs: 90 + index * 150,
    });
  });

  return segments
    .slice(0, COMBAT_PROJECTILE_LIMIT)
    .map(normalizeCombatProjectileSegment);
}

const CombatEffectsLayer = React.memo(function CombatEffectsLayer({
  markers,
  contacts,
  now,
}: {
  markers: ShipMarkerSnapshot[];
  contacts: SystemTacticalFleetContact[];
  now: number;
}) {
  const segments = buildCombatProjectileSegments({ markers, contacts, now });

  return (
    <>
      {segments.map((segment) => (
        <CombatProjectile key={segment.id} segment={segment} />
      ))}
    </>
  );
});

function CombatProjectile({ segment }: { segment: CombatProjectileSegment }) {
  const length = Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1);
  if (length < 8) return null;
  const tone = weaponTone(segment.kind);
  const angle = Math.atan2(segment.y2 - segment.y1, segment.x2 - segment.x1);
  const isBeam = segment.kind === "beam";
  const isKinetic = segment.kind === "kinetic";

  return (
    <div
      className={`combat-projectile-line combat-projectile-line--${segment.kind}`}
      style={{
        position: "absolute",
        left: segment.x1,
        top: segment.y1,
        width: length,
        height: isBeam ? 3 : isKinetic ? 10 : 8,
        transform: `rotate(${angle}rad)`,
        transformOrigin: "0 50%",
        color: tone,
        pointerEvents: "none",
        zIndex: 4,
      }}
    >
      {isKinetic ? (
        <>
          <span
            className="combat-projectile-trail combat-projectile-trail--kinetic"
            style={{
              background: `linear-gradient(90deg, transparent, ${tone}, transparent)`,
            }}
          />
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className="combat-projectile-round"
              style={{
                background: tone,
                boxShadow: `0 0 7px ${tone}`,
                animationDelay: `${segment.delayMs + index * 110}ms`,
              }}
            />
          ))}
        </>
      ) : (
        <span
          className="combat-projectile-trail"
          style={{
            background: isBeam
              ? `linear-gradient(90deg, transparent, ${tone}, transparent)`
              : `linear-gradient(90deg, transparent, ${tone})`,
            animationDelay: `${segment.delayMs}ms`,
          }}
        />
      )}
      {!isBeam && !isKinetic ? (
        <span
          className="combat-projectile-bolt"
          style={{
            background: tone,
            boxShadow: `0 0 12px ${tone}`,
            animationDelay: `${segment.delayMs}ms`,
          }}
        />
      ) : null}
    </div>
  );
}

const FleetContactMarkers = React.memo(function FleetContactMarkers({
  contacts,
  isPicking,
  now,
  selectedContactId,
  onSelectContact,
}: {
  contacts: SystemTacticalFleetContact[];
  isPicking: boolean;
  now: number;
  selectedContactId: string | null;
  onSelectContact: (contact: SystemTacticalFleetContact) => void;
}) {
  const { locale, t } = useI18n();
  const contactRenderPoints = useMemo(
    () => buildFleetContactRenderPoints(contacts),
    [contacts],
  );

  return (
    <>
      {contacts.map((contact) => {
        const renderPoint = contactRenderPoint(contact, contactRenderPoints);
        const x = renderPoint.x;
        const y = renderPoint.y;
        const isOwnContact = contact.relation === "self";
        const title = isOwnContact
          ? contact.shipTypeId
            ? getShipLabel(contact.shipTypeId, locale)
            : t("sector.entity.unknownFleet")
          : contact.ownerAlias
            ? t("sector.entity.foreignSource", { source: contact.ownerAlias })
            : t("sector.entity.unknownFleet");
        const isSelected = selectedContactId === contact.id;
        const isInCombat = isRecentCombat(contact.lastCombatTickAt, now);
        const motionAngle = fleetContactMotionAngle(contact);
        const isMoving = motionAngle != null;
        const tone = isInCombat
          ? "#FF5A6E"
          : isOwnContact
            ? isMoving
              ? "#5BD7FF"
              : "#5BFFA9"
            : "#EF4444";

        return (
          <button
            key={contact.id}
            type="button"
            data-testid={`map-${isOwnContact ? "own" : "foreign"}-ship-${contact.id}`}
            title={title}
            onClick={(e) => {
              e.stopPropagation();
              onSelectContact(contact);
            }}
            style={{
              position: "absolute",
              left: x - 14,
              top: y - 14,
              width: 28,
              height: 28,
              color: tone,
              boxSizing: "border-box",
              border: isSelected
                ? "1px solid rgba(255,255,255,0.88)"
                : "1px solid transparent",
              borderRadius: 8,
              background: isSelected
                ? isOwnContact
                  ? "radial-gradient(circle at 50% 42%, rgba(91,215,255,0.24), rgba(8,12,22,0.78) 70%)"
                  : "radial-gradient(circle at 50% 42%, rgba(239,68,68,0.25), rgba(8,12,22,0.78) 70%)"
                : "transparent",
              boxShadow: isInCombat
                ? "0 0 18px rgba(248,113,113,0.72)"
                : isOwnContact
                  ? "0 0 12px rgba(91,215,255,0.34)"
                  : "0 0 14px rgba(239,68,68,0.38)",
              pointerEvents: isPicking ? "none" : "auto",
              transition: isMoving ? "left 5s linear, top 5s linear" : "none",
              zIndex: isInCombat || isSelected ? 7 : 5,
              padding: 1,
              cursor: isPicking ? "inherit" : "pointer",
            }}
          >
            <span
              style={{
                display: "grid",
                placeItems: "center",
                transform:
                  motionAngle != null ? `rotate(${motionAngle}rad)` : "none",
              }}
            >
              <ShipIcon
                typeId={contact.shipTypeId}
                size={26}
                tone="currentColor"
              />
            </span>
            <ShipHealthBar
              hp={contact.hp}
              maxHp={contact.maxHp}
              isForeign={!isOwnContact}
            />
          </button>
        );
      })}
    </>
  );
});

function statusLabelForMapShip(
  status: string | undefined,
  t: (key: string) => string,
): string {
  if (status === "idle" || status === "stationed") return t("ships.orbit");
  if (status === "moving" || status === "in_flight" || status === "returning")
    return t("ships.inTransit");
  if (status === "building") return t("ships.building");
  return t("common.status");
}

interface MapShipAction {
  label: string;
  icon: React.ReactNode;
  disabled: boolean;
}

function actionForOwnMapShip({
  ship,
  shipType,
  activeExpedition,
  t,
}: {
  ship: Ship;
  shipType: ShipType | null;
  activeExpedition: Expedition | null;
  t: (key: string) => string;
}): MapShipAction {
  const isCargoShip = shipType ? isCargoTransferShipType(shipType) : false;
  const isDiscoveryProbe = ship.typeId === "recon_probe";
  const isStationed = activeExpedition?.status === "stationed";
  const isIdle = isShipReadyForOrders(ship);
  const canIssueOrders =
    ship.status !== "destroyed" &&
    (isIdle || (isStationed && !isCargoShip && !isDiscoveryProbe));

  if (isCargoShip) {
    return {
      label: t("ships.openCargo"),
      icon: <Package size={14} />,
      disabled: !canIssueOrders || !ship.locationPlanetId,
    };
  }

  if (isDiscoveryProbe) {
    return {
      label: t("ships.openJumpGate"),
      icon: <RadioTower size={14} />,
      disabled: !isIdle,
    };
  }

  if (ship.typeId === "refueler" && isIdle) {
    return {
      label: t("refuel_dialog_transfer_button"),
      icon: <Fuel size={14} />,
      disabled: false,
    };
  }

  return {
    label: t("ships.sendMission"),
    icon: <Send size={14} />,
    disabled: !canIssueOrders,
  };
}

function SelectedMapShipCard({
  selection,
  ownShip,
  contact,
  shipType,
  activeExpedition,
  onAction,
  onClose,
}: {
  selection: MapShipSelection;
  ownShip: Ship | null;
  contact: SystemTacticalFleetContact | null;
  shipType: ShipType | null;
  activeExpedition: Expedition | null;
  onAction?: (
    ship: Ship,
    shipType: ShipType | null,
    expedition: Expedition | null,
  ) => void;
  onClose: () => void;
}) {
  const { locale, t } = useI18n();
  const isForeign = selection.kind === "foreign";
  const typeId = ownShip?.typeId ?? contact?.shipTypeId ?? shipType?.id ?? null;
  const stats =
    contact?.combatStats ?? ownShip?.combatStats ?? shipType?.combatStats;
  const hp = contact?.hp ?? ownShip?.hp ?? shipType?.hp ?? 0;
  const maxHp = contact?.maxHp ?? ownShip?.maxHp ?? shipType?.hp ?? 0;
  const hullPct = hpPercent(hp, maxHp);
  const rangeKey = rangeLabelKey(stats?.engagementRange);
  const dps = combatDps(stats) || shipType?.dps || 0;
  const weaponKind = weaponVisualForCombatStats(stats);
  const title = typeId
    ? getShipLabel(typeId, locale)
    : t("sector.entity.unknownFleet");
  const status = isForeign
    ? t("map.shipStatus.hostile")
    : isRecentCombat(
          contact?.lastCombatTickAt ?? ownShip?.lastCombatTickAt,
          Date.now(),
        )
      ? t("ships.state.combat")
      : statusLabelForMapShip(contact?.status ?? ownShip?.status, t);
  const ownAction =
    !isForeign && ownShip
      ? actionForOwnMapShip({
          ship: ownShip,
          shipType,
          activeExpedition,
          t,
        })
      : null;

  return (
    <div
      className="cosmic-selection-card animate-in slide-in-from-bottom-4 duration-300"
      data-testid="map-ship-card"
      style={{
        position: "absolute",
        left: "50%",
        bottom: 110,
        transform: "translateX(-50%)",
        width: "calc(100% - 32px)",
        maxWidth: 380,
        padding: "12px 14px",
        border: isForeign
          ? "1px solid rgba(248,113,113,0.5)"
          : "1px solid var(--line-strong)",
        borderRadius: 12,
        background: isForeign ? "rgba(36,12,20,0.92)" : "rgba(14,20,36,0.92)",
        backdropFilter: "blur(10px)",
        color: "var(--text)",
        zIndex: 6,
        pointerEvents: "auto",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "44px minmax(0, 1fr) 28px",
          gap: 10,
          alignItems: "center",
        }}
      >
        <ShipIconBadge
          typeId={typeId}
          tone={isForeign ? "#EF4444" : undefined}
          status={ownShip?.status ?? "idle"}
          size={34}
          title={title}
        />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              letterSpacing: "0.16em",
              color: isForeign ? "#fca5a5" : "var(--accent)",
              marginBottom: 3,
            }}
          >
            {(isForeign
              ? t("map.shipContact.hostile")
              : t("map.shipContact.own")
            ).toUpperCase()}{" "}
            · {status}
          </div>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 17,
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {title}
          </div>
        </div>
        <button
          type="button"
          aria-label={t("common.close")}
          onClick={onClose}
          style={{
            width: 28,
            height: 28,
            display: "grid",
            placeItems: "center",
            borderRadius: 8,
            border: "1px solid var(--line)",
            background: "rgba(5,8,17,0.6)",
            color: "var(--text-dim)",
            padding: 0,
          }}
        >
          <X size={16} />
        </button>
      </div>

      <div className="qstrip-bar" style={{ marginTop: 10, height: 5 }}>
        <div
          className="qstrip-fill"
          style={{
            width: `${hullPct}%`,
            background: hpTone(hullPct),
            boxShadow: `0 0 8px ${hpTone(hullPct)}`,
          }}
        />
      </div>

      <div
        className="ship-stats"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          marginTop: 10,
          justifyContent: "stretch",
        }}
      >
        <div className="ship-stat" style={{ textAlign: "left" }}>
          <span>{t("ships.hp")}</span>
          <b style={{ color: hpTone(hullPct) }}>
            {Math.max(0, Math.round(hp))} / {Math.max(0, Math.round(maxHp))}
          </b>
        </div>
        <div className="ship-stat" style={{ textAlign: "left" }}>
          <span>{t("ships.dps")}</span>
          <b>{dps}</b>
        </div>
        <div className="ship-stat" style={{ textAlign: "left" }}>
          <span>{t("map.weapon")}</span>
          <b>{t(`map.weapon.${weaponKind}`)}</b>
        </div>
        <div className="ship-stat" style={{ textAlign: "left" }}>
          <span>{t("map.range")}</span>
          <b>{rangeKey ? t(rangeKey) : t("common.unknown")}</b>
        </div>
        {!isForeign ? (
          <>
            <div className="ship-stat" style={{ textAlign: "left" }}>
              <span>{t("expedition.fuel")}</span>
              <b>
                {ownShip?.fuel ?? 0} / {shipType?.fuelCapacity ?? 0}
              </b>
            </div>
            <div className="ship-stat" style={{ textAlign: "left" }}>
              <span>{t("expedition.jumpFuel")}</span>
              <b>
                {ownShip?.jumpFuel ?? 0} / {shipType?.jumpFuelCapacity ?? 0}
              </b>
            </div>
          </>
        ) : contact?.ownerAlias ? (
          <div
            className="ship-stat"
            style={{ textAlign: "left", gridColumn: "1 / -1" }}
          >
            <span>{t("map.owner")}</span>
            <b>{contact.ownerAlias}</b>
          </div>
        ) : null}
      </div>

      <ShieldStatus shields={stats?.shields} />

      {ownAction && onAction ? (
        <button
          type="button"
          className="cosmic-cta"
          disabled={ownAction.disabled}
          onClick={() => {
            if (!ownShip || ownAction.disabled) return;
            onAction(ownShip, shipType, activeExpedition);
          }}
          style={{
            width: "100%",
            marginTop: 10,
            padding: "9px 12px",
            fontSize: 11,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 7,
            opacity: ownAction.disabled ? 0.45 : 1,
            cursor: ownAction.disabled ? "not-allowed" : "pointer",
          }}
        >
          {ownAction.icon}
          <span>{ownAction.label.toUpperCase()}</span>
        </button>
      ) : null}
    </div>
  );
}

const DraftExpeditionTrail = React.memo(function DraftExpeditionTrail({
  launch,
  target,
}: {
  launch: SystemMapPoint;
  target: SystemMapPoint;
}) {
  return (
    <>
      <RouteLine
        x1={launch.x}
        y1={launch.y}
        x2={target.x}
        y2={target.y}
        color="#5BD7FF"
        thickness={2.5}
        dash={10}
        gap={6}
        opacity={0.92}
        zIndex={3}
      />
      <div
        style={{
          position: "absolute",
          left: target.x - 9,
          top: target.y - 9,
          width: 18,
          height: 18,
          border: "2px solid #a5b4fc",
          borderRadius: "50%",
          pointerEvents: "none",
          zIndex: 4,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: target.x - 4,
          top: target.y - 4,
          width: 8,
          height: 8,
          background: "#c7d2fe",
          borderRadius: "50%",
          pointerEvents: "none",
          zIndex: 4,
        }}
      />
    </>
  );
});

export function CosmicSystemRenderer({
  system,
  ships,
  shipTypes = [],
  expeditions,
  fleetContacts = [],
  fleetContactsAuthoritative = false,
  onPlanetClick,
  onColonizeClick,
  ownedPlanetIds,
  expeditionPick,
  jumpGate,
  minimumOrbitCount,
  emptyStateLabel,
  showOrbitRings = true,
  onOwnShipAction,
}: CosmicSystemRendererProps) {
  const { locale, t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 0.3 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedShip, setSelectedShip] = useState<MapShipSelection | null>(
    null,
  );
  const [now, setNow] = useState(() => Date.now());
  const [pointerCount, setPointerCount] = useState(0);
  const [isColonyDialogOpen, setIsColonyDialogOpen] = useState(false);
  const shouldCloseSelectionOnTapRef = useRef(false);
  /** Expedition mode: defer pan until finger moves past tap threshold so taps can aim. */
  const expeditionPanArmRef = useRef<{
    exceeded: boolean;
    startX: number;
    startY: number;
  } | null>(null);
  const pickEmitFrameRef = useRef<number | null>(null);
  const pendingPickDeltaRef = useRef<{ dx: number; dy: number } | null>(null);
  const lastPickDeltaRef = useRef<{ dx: number; dy: number } | null>(null);
  const pendingPickPointRef = useRef<SystemMapPoint | null>(null);
  const lastPickPointRef = useRef<SystemMapPoint | null>(null);

  // ----- Layout ----------------------------------------------------------

  const layouts = useMemo<PlanetLayout[]>(() => {
    const seed = Number(system?.seed) || 1;
    const planets = (system?.planets ?? []).filter(isDiscoveredPlanet);
    const planetById = new Map(planets.map((planet) => [planet.id, planet]));
    return buildSystemMapLayouts(planets, seed).map((layout) => ({
      ...layout,
      planet: planetById.get(layout.id)!,
    }));
  }, [system]);

  const layoutByPlanetId = useMemo(
    () => new Map(layouts.map((layout) => [layout.planet.id, layout])),
    [layouts],
  );

  const activeExpeditions = useMemo(
    () => expeditions.filter(isActiveMapExpedition),
    [expeditions],
  );

  const visibleFleetContacts = useMemo(
    () => fleetContactsForSystem(fleetContacts, system.id),
    [fleetContacts, system.id],
  );

  const tacticalShipIds = useMemo(
    () => new Set(visibleFleetContacts.map((contact) => contact.id)),
    [visibleFleetContacts],
  );

  const tacticalExpeditionShipIds = useMemo(() => {
    return tacticalExpeditionShipIdsForRenderedContacts({
      activeExpeditions,
      visibleFleetContacts,
      fleetContactsAuthoritative,
      systemId: system.id,
    });
  }, [
    activeExpeditions,
    fleetContactsAuthoritative,
    system.id,
    visibleFleetContacts,
  ]);

  const mapShips = useMemo(
    () =>
      ships.filter(
        (ship) =>
          !tacticalShipIds.has(ship.id) &&
          !tacticalExpeditionShipIds.has(ship.id),
      ),
    [ships, tacticalExpeditionShipIds, tacticalShipIds],
  );

  const mapExpeditions = useMemo(
    () =>
      activeExpeditions.filter(
        (expedition) => !tacticalExpeditionShipIds.has(expedition.shipId),
      ),
    [activeExpeditions, tacticalExpeditionShipIds],
  );

  const shipTypeById = useMemo(
    () => new Map(shipTypes.map((shipType) => [shipType.id, shipType])),
    [shipTypes],
  );

  const hasMovingShips =
    mapExpeditions.length > 0 &&
    mapShips.some((ship) => ship.status === "moving");
  const hasMovingFleetContacts = visibleFleetContacts.some(
    (contact) => contact.status !== "stationed",
  );
  const hasRecentCombat =
    mapShips.some((ship) => {
      if (ship.status === "destroyed") return false;
      return isRecentCombat(ship.lastCombatTickAt, now);
    }) ||
    visibleFleetContacts.some((contact) =>
      isRecentCombat(contact.lastCombatTickAt, now),
    );

  useEffect(() => {
    if (!hasMovingShips && !hasMovingFleetContacts && !hasRecentCombat) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), SHIP_MARKER_TICK_MS);
    return () => clearInterval(timer);
  }, [hasMovingShips, hasMovingFleetContacts, hasRecentCombat]);

  const shipMarkerSnapshots = useMemo(
    () =>
      buildShipMarkerSnapshots({
        ships: mapShips,
        activeExpeditions: mapExpeditions,
        layoutByPlanetId,
        system,
        now,
      }),
    [layoutByPlanetId, mapExpeditions, mapShips, now, system],
  );

  const expeditionTrailSegments = useMemo(
    () =>
      buildExpeditionTrailSegments(mapExpeditions, layoutByPlanetId, system),
    [layoutByPlanetId, mapExpeditions, system],
  );

  const selected = useMemo(
    () =>
      selectedId
        ? (layouts.find((l) => l.planet.id === selectedId) ?? null)
        : null,
    [layouts, selectedId],
  );

  const selectedOwnShipRecord =
    selectedShip?.kind === "own"
      ? (ships.find((ship) => ship.id === selectedShip.id) ?? null)
      : null;
  const selectedOwnMapShip =
    selectedShip?.kind === "own"
      ? (mapShips.find(
          (ship) => ship.id === selectedShip.id && ship.status !== "destroyed",
        ) ?? null)
      : null;
  const selectedTacticalContact =
    selectedShip
      ? (visibleFleetContacts.find(
          (contact) => contact.id === selectedShip.id,
        ) ?? null)
      : null;
  const selectedOwnShip =
    selectedTacticalContact?.relation === "self"
      ? selectedOwnShipRecord
      : selectedOwnMapShip;
  const selectedOwnShipExpedition = selectedOwnShip
    ? (activeExpeditions.find(
        (expedition) => expedition.shipId === selectedOwnShip.id,
      ) ?? null)
    : null;
  const selectedShipType = selectedOwnShip
    ? (shipTypeById.get(selectedOwnShip.typeId) ?? null)
    : selectedTacticalContact?.shipTypeId
      ? (shipTypeById.get(selectedTacticalContact.shipTypeId) ?? null)
      : null;
  const selectedMapShip =
    selectedShip &&
    ((selectedShip.kind === "own" &&
      (selectedOwnShip || selectedTacticalContact?.relation === "self")) ||
      (selectedShip.kind === "foreign" && selectedTacticalContact))
      ? selectedShip
      : null;

  const mineableResources = useMemo(() => {
    if (!selected?.planet.resources) return [];
    return selected.planet.resources
      .filter((resource) => (resource.richness ?? 0) > 0)
      .sort((a, b) => {
        const aLabel = getResourceLabel(a.resourceId, locale).toLowerCase();
        const bLabel = getResourceLabel(b.resourceId, locale).toLowerCase();
        return aLabel.localeCompare(bLabel);
      });
  }, [selected, locale]);
  const selectedIsOwnedPlanet = selected
    ? isPlanetOwnedByViewer(selected.planet, ownedPlanetIds)
    : false;
  const selectedIsForeignColony = selected
    ? isForeignColonizedPlanet(selected.planet, ownedPlanetIds)
    : false;

  const orbitRadii = useMemo(() => {
    return buildSystemMapOrbitGuideRadii(
      system?.planets ?? [],
      minimumOrbitCount,
    );
  }, [minimumOrbitCount, system?.planets]);

  const planetOuterRadius = useMemo(
    () =>
      Math.max(
        120,
        ...orbitRadii,
        ...layouts.map((layout) => layout.orbitRadius + layout.spriteSize / 2),
      ) + 60,
    [layouts, orbitRadii],
  );
  const jumpGateOrbitRadius = planetOuterRadius + 84;
  const defaultJumpGatePosition = useMemo(() => {
    const fixedGate = systemMapJumpGatePoint();
    const fixedRadius = Math.hypot(fixedGate.x, fixedGate.y);
    if (jumpGateOrbitRadius <= fixedRadius) return fixedGate;
    const angle = Math.atan2(fixedGate.y, fixedGate.x);
    return {
      x: Math.cos(angle) * jumpGateOrbitRadius,
      y: Math.sin(angle) * jumpGateOrbitRadius,
    };
  }, [jumpGateOrbitRadius]);
  const jumpGatePosition = jumpGate?.position ?? defaultJumpGatePosition;
  const visibleOuterRadius = jumpGate
    ? Math.max(
        planetOuterRadius,
        Math.hypot(jumpGatePosition.x, jumpGatePosition.y) + 64,
      )
    : planetOuterRadius;
  const isPicking = Boolean(expeditionPick);
  const canPickPlanet = Boolean(expeditionPick?.onPickPlanet);
  const onPickSectorDelta = expeditionPick?.onPickSectorDelta;
  const onPickPlanet = expeditionPick?.onPickPlanet;
  const pickedTargetPlanetId = expeditionPick?.targetPlanetId ?? null;

  const selectPlanet = useCallback((planetId: string) => {
    setSelectedId(planetId);
    setSelectedShip(null);
  }, []);

  const selectOwnShip = useCallback((shipId: string) => {
    setSelectedShip({ kind: "own", id: shipId });
    setSelectedId(null);
  }, []);

  const selectTacticalContact = useCallback((contact: SystemTacticalFleetContact) => {
    setSelectedShip({
      kind: contact.relation === "self" ? "own" : "foreign",
      id: contact.id,
    });
    setSelectedId(null);
  }, []);

  const emitPickSectorDelta = useCallback(
    (dx: number, dy: number, immediate = false) => {
      if (!onPickSectorDelta) return;

      const last = lastPickDeltaRef.current;
      if (last && Math.hypot(dx - last.dx, dy - last.dy) < PICK_DELTA_EPSILON) {
        return;
      }

      if (immediate) {
        if (pickEmitFrameRef.current !== null) {
          window.cancelAnimationFrame(pickEmitFrameRef.current);
          pickEmitFrameRef.current = null;
        }
        pendingPickDeltaRef.current = null;
        lastPickDeltaRef.current = { dx, dy };
        onPickSectorDelta(dx, dy);
        return;
      }

      pendingPickDeltaRef.current = { dx, dy };
      if (pickEmitFrameRef.current !== null) return;

      pickEmitFrameRef.current = window.requestAnimationFrame(() => {
        pickEmitFrameRef.current = null;
        const pending = pendingPickDeltaRef.current;
        pendingPickDeltaRef.current = null;
        if (!pending) return;

        const currentLast = lastPickDeltaRef.current;
        if (
          currentLast &&
          Math.hypot(pending.dx - currentLast.dx, pending.dy - currentLast.dy) <
            PICK_DELTA_EPSILON
        ) {
          return;
        }

        lastPickDeltaRef.current = pending;
        onPickSectorDelta(pending.dx, pending.dy);
      });
    },
    [onPickSectorDelta],
  );

  const emitPickSystemPoint = useCallback(
    (point: SystemMapPoint, immediate = false) => {
      const onPickSystemPoint = expeditionPick?.onPickSystemPoint;
      if (!onPickSystemPoint) return;

      const last = lastPickPointRef.current;
      if (last && Math.hypot(point.x - last.x, point.y - last.y) < 1) {
        return;
      }

      if (immediate) {
        if (pickEmitFrameRef.current !== null) {
          window.cancelAnimationFrame(pickEmitFrameRef.current);
          pickEmitFrameRef.current = null;
        }
        pendingPickPointRef.current = null;
        lastPickPointRef.current = point;
        onPickSystemPoint(point);
        return;
      }

      pendingPickPointRef.current = point;
      if (pickEmitFrameRef.current !== null) return;

      pickEmitFrameRef.current = window.requestAnimationFrame(() => {
        pickEmitFrameRef.current = null;
        const pending = pendingPickPointRef.current;
        pendingPickPointRef.current = null;
        if (!pending) return;

        const currentLast = lastPickPointRef.current;
        if (
          currentLast &&
          Math.hypot(pending.x - currentLast.x, pending.y - currentLast.y) < 1
        ) {
          return;
        }

        lastPickPointRef.current = pending;
        onPickSystemPoint(pending);
      });
    },
    [expeditionPick],
  );

  const emitPickFromClientPoint = useCallback(
    (clientX: number, clientY: number, immediate = false) => {
      const pickCfg = expeditionPick;
      const el = containerRef.current;
      if (!pickCfg || !el) return;

      const { wx, wy } = clientToWorldCoords(el, transform, clientX, clientY);
      if (pickCfg.onPickSystemPoint) {
        emitPickSystemPoint({ x: wx, y: wy }, immediate);
        return;
      }

      const wPerLy = pickCfg.worldUnitsPerLy ?? SYSTEM_MAP_WORLD_UNITS_PER_LY;
      const launch = pickCfg.launchPlanetId
        ? layoutByPlanetId.get(pickCfg.launchPlanetId)
        : null;
      const routeStart = pickCfg.routeStartPoint ?? launch ?? { x: 0, y: 0 };
      const { dx, dy } = worldRayToSectorDelta(
        wx,
        wy,
        routeStart.x,
        routeStart.y,
        wPerLy,
      );
      emitPickSectorDelta(dx, dy, immediate);
    },
    [
      emitPickSectorDelta,
      emitPickSystemPoint,
      expeditionPick,
      layoutByPlanetId,
      transform,
    ],
  );

  useEffect(() => {
    if (onPickSectorDelta || expeditionPick?.onPickSystemPoint) return;
    if (pickEmitFrameRef.current !== null) {
      window.cancelAnimationFrame(pickEmitFrameRef.current);
      pickEmitFrameRef.current = null;
    }
    pendingPickDeltaRef.current = null;
    lastPickDeltaRef.current = null;
    pendingPickPointRef.current = null;
    lastPickPointRef.current = null;
  }, [expeditionPick?.onPickSystemPoint, onPickSectorDelta]);

  useEffect(
    () => () => {
      if (pickEmitFrameRef.current !== null) {
        window.cancelAnimationFrame(pickEmitFrameRef.current);
      }
    },
    [],
  );

  // ----- Pan / pinch / wheel --------------------------------------------

  const dragState = useRef({
    pointerId: null as number | null,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    pinchStartDist: 0,
    pinchStartScale: 0.3,
    pointers: new Map<number, { x: number; y: number }>(),
  });

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = containerRef.current;
      if (!el) return;
      const target = e.target as HTMLElement | null;
      const isCardControl =
        target?.closest(".cosmic-selection-card") !== null ||
        target?.closest("button") !== null;
      if (isCardControl) {
        shouldCloseSelectionOnTapRef.current = false;
        expeditionPanArmRef.current = null;
        return;
      }
      el.setPointerCapture(e.pointerId);
      dragState.current.pointers.set(e.pointerId, {
        x: e.clientX,
        y: e.clientY,
      });
      setPointerCount(dragState.current.pointers.size);
      if (expeditionPick && dragState.current.pointers.size === 1) {
        expeditionPanArmRef.current = {
          exceeded: false,
          startX: e.clientX,
          startY: e.clientY,
        };
      }
      if (dragState.current.pointers.size === 1) {
        dragState.current.pointerId = e.pointerId;
        dragState.current.startX = e.clientX;
        dragState.current.startY = e.clientY;
        dragState.current.originX = transform.x;
        dragState.current.originY = transform.y;
        shouldCloseSelectionOnTapRef.current = !isCardControl;
      } else if (dragState.current.pointers.size === 2) {
        shouldCloseSelectionOnTapRef.current = false;
        expeditionPanArmRef.current = null;
        const pts = Array.from(dragState.current.pointers.values());
        const dx = pts[0].x - pts[1].x;
        const dy = pts[0].y - pts[1].y;
        dragState.current.pinchStartDist = Math.hypot(dx, dy);
        dragState.current.pinchStartScale = transform.scale;
      }
    },
    [transform, expeditionPick],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragState.current.pointers.has(e.pointerId)) return;
      dragState.current.pointers.set(e.pointerId, {
        x: e.clientX,
        y: e.clientY,
      });
      if (dragState.current.pointers.size === 2) {
        expeditionPanArmRef.current = null;
        const pts = Array.from(dragState.current.pointers.values());
        const dx = pts[0].x - pts[1].x;
        const dy = pts[0].y - pts[1].y;
        const dist = Math.hypot(dx, dy) || 1;
        const ratio = dist / Math.max(1, dragState.current.pinchStartDist);
        const newScale = Math.max(
          MIN_SCALE,
          Math.min(MAX_SCALE, dragState.current.pinchStartScale * ratio),
        );
        setTransform((t) => ({ ...t, scale: newScale }));
      } else if (e.pointerId === dragState.current.pointerId) {
        if (
          expeditionPick &&
          expeditionPanArmRef.current &&
          !expeditionPanArmRef.current.exceeded &&
          dragState.current.pointers.size === 1
        ) {
          const arm = expeditionPanArmRef.current;
          const moved = Math.hypot(
            e.clientX - arm.startX,
            e.clientY - arm.startY,
          );

          // Real-time aiming update.
          emitPickFromClientPoint(e.clientX, e.clientY);

          if (moved < EXPEDITION_TAP_THRESHOLD_PX) {
            return;
          }

          // If we moved significantly, check if we should switch to pan or stay in aim
          // If the drag started near the launch planet, we treat it as 'drag to aim' and stay.
          // Otherwise we switch to panning.
          const { wx: swx, wy: swy } = clientToWorldCoords(
            containerRef.current!,
            transform,
            arm.startX,
            arm.startY,
          );
          const launch = expeditionPick.launchPlanetId
            ? layoutByPlanetId.get(expeditionPick.launchPlanetId)
            : null;
          const routeStart = expeditionPick.routeStartPoint ??
            launch ?? { x: 0, y: 0 };
          const distFromLaunch = Math.hypot(
            swx - routeStart.x,
            swy - routeStart.y,
          );

          if (distFromLaunch < 100) {
            // started near launch
            // Stay in 'aim' mode, don't set exceeded = true for panning
            return;
          }

          expeditionPanArmRef.current.exceeded = true;
          dragState.current.startX = e.clientX;
          dragState.current.startY = e.clientY;
          dragState.current.originX = transform.x;
          dragState.current.originY = transform.y;
        }
        const dx = e.clientX - dragState.current.startX;
        const dy = e.clientY - dragState.current.startY;
        setTransform((t) => ({
          ...t,
          x: dragState.current.originX + dx,
          y: dragState.current.originY + dy,
        }));
      }
    },
    [emitPickFromClientPoint, expeditionPick, layoutByPlanetId, transform],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = containerRef.current;
      const pickCfg = expeditionPick;
      const arm = expeditionPanArmRef.current;
      const startedWithOnePointer = dragState.current.pointers.size === 1;
      const movedFromDownAll = Math.hypot(
        e.clientX - dragState.current.startX,
        e.clientY - dragState.current.startY,
      );
      const movedFromDown =
        arm != null
          ? Math.hypot(e.clientX - arm.startX, e.clientY - arm.startY)
          : Infinity;
      const wasAimTap =
        pickCfg &&
        arm &&
        !arm.exceeded &&
        movedFromDown < EXPEDITION_TAP_THRESHOLD_PX &&
        el &&
        dragState.current.pointers.size === 1 &&
        e.pointerId === dragState.current.pointerId;

      dragState.current.pointers.delete(e.pointerId);
      setPointerCount(dragState.current.pointers.size);
      if (dragState.current.pointers.size === 0) {
        dragState.current.pointerId = null;
      }

      if (wasAimTap && pickCfg) {
        emitPickFromClientPoint(e.clientX, e.clientY, true);
      }
      if (
        !pickCfg &&
        startedWithOnePointer &&
        shouldCloseSelectionOnTapRef.current &&
        (selectedId !== null || selectedShip !== null) &&
        movedFromDownAll < EXPEDITION_TAP_THRESHOLD_PX &&
        !wasAimTap
      ) {
        setSelectedId(null);
        setSelectedShip(null);
      }

      shouldCloseSelectionOnTapRef.current = false;

      expeditionPanArmRef.current = null;
    },
    [emitPickFromClientPoint, expeditionPick, selectedId, selectedShip],
  );

  // Wheel handler: must be passive: false to call preventDefault. React's
  // onWheel is registered as passive in modern React, so we attach manually.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.0015);
      setTransform((t) => {
        const newScale = Math.max(
          MIN_SCALE,
          Math.min(MAX_SCALE, t.scale * factor),
        );
        const rect = el.getBoundingClientRect();
        // Zoom around cursor relative to the container centre.
        const cx = e.clientX - rect.left - rect.width / 2;
        const cy = e.clientY - rect.top - rect.height / 2;
        const ratio = newScale / t.scale;
        return {
          scale: newScale,
          x: cx - (cx - t.x) * ratio,
          y: cy - (cy - t.y) * ratio,
        };
      });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  const resetView = () => setTransform({ x: 0, y: 0, scale: 0.3 });

  // Auto-fit: when the system loads, choose a starting scale that fits the
  // outermost orbit comfortably inside the visible area. Keeps the home
  // system visible on first paint without requiring the user to zoom out.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || layouts.length === 0) return;
    const rect = el.getBoundingClientRect();
    const minSide = Math.min(rect.width, rect.height);
    if (minSide <= 0) return;
    const fitScale = Math.max(
      MIN_SCALE,
      Math.min(MAX_SCALE, (minSide * 0.9) / (visibleOuterRadius * 2)),
    );
    setTransform({ x: 0, y: 0, scale: fitScale });
    // run once per system
  }, [visibleOuterRadius]);

  // ----- Render ----------------------------------------------------------

  return (
    <div
      ref={containerRef}
      className="cosmic-systemmap"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        touchAction: "none",
        cursor:
          expeditionPick && pointerCount === 0
            ? "crosshair"
            : pointerCount > 0
              ? "grabbing"
              : "grab",
        background:
          "radial-gradient(ellipse at 50% 50%, rgba(91,215,255,0.06), transparent 60%), #050811",
      }}
    >
      {/* Centring frame — guarantees the world wrapper is at the visual
          centre even if the parent has weird sizing. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none", // the container above handles pointer events
        }}
      >
        <div
          style={{
            position: "relative",
            width: 0,
            height: 0,
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            transformOrigin: "0 0",
            willChange: "transform",
            pointerEvents: "none",
          }}
        >
          {/* Orbit rings */}
          {showOrbitRings ? (
            <OrbitRings orbitRadii={orbitRadii} isPicking={isPicking} />
          ) : null}

          {/* Sun */}
          <div
            style={{
              position: "absolute",
              left: -56,
              top: -56,
              width: 112,
              height: 112,
              pointerEvents: expeditionPick ? "none" : "auto",
            }}
          >
            <SunSvg size={112} />
          </div>

          {jumpGate ? (
            <button
              type="button"
              data-testid="jump-gate-marker"
              onClick={(e) => {
                e.stopPropagation();
                jumpGate.onClick();
              }}
              style={{
                position: "absolute",
                left: jumpGatePosition.x - 34,
                top: jumpGatePosition.y - 34,
                width: 68,
                height: 68,
                border: jumpGate.unlocked
                  ? "1.5px solid rgba(91,215,255,0.82)"
                  : "1.5px dashed rgba(148,163,184,0.55)",
                borderRadius: "50%",
                background: jumpGate.unlocked
                  ? "radial-gradient(circle, rgba(91,215,255,0.28), rgba(8,12,22,0.78) 64%)"
                  : "radial-gradient(circle, rgba(148,163,184,0.15), rgba(8,12,22,0.78) 64%)",
                color: jumpGate.unlocked ? "#5BD7FF" : "rgba(203,213,225,0.72)",
                boxShadow: jumpGate.unlocked
                  ? "0 0 28px rgba(91,215,255,0.36), inset 0 0 18px rgba(91,215,255,0.18)"
                  : "inset 0 0 16px rgba(148,163,184,0.12)",
                pointerEvents: expeditionPick ? "none" : "auto",
                cursor: expeditionPick ? "inherit" : "pointer",
                transform: "translateZ(0)",
                zIndex: 2,
              }}
              aria-label={t("jumpGate.title")}
            >
              <span
                style={{
                  position: "absolute",
                  inset: 12,
                  border: "1px solid currentColor",
                  borderRadius: 18,
                  transform: "rotate(45deg)",
                  opacity: 0.9,
                }}
              />
              <span
                style={{
                  position: "absolute",
                  inset: 25,
                  borderRadius: "50%",
                  background: "currentColor",
                  boxShadow: "0 0 14px currentColor",
                }}
              />
              <span
                style={{
                  position: "absolute",
                  top: "100%",
                  left: "50%",
                  transform: "translate(-50%, 7px)",
                  minWidth: 120,
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  letterSpacing: "0.08em",
                  color: jumpGate.unlocked ? "#5BD7FF" : "var(--text-dim)",
                  textShadow: "0 1px 2px rgba(0,0,0,0.8)",
                }}
              >
                {jumpGate.statusLabel.toUpperCase()}
              </span>
            </button>
          ) : null}

          {/* Planets */}
          <PlanetMarkers
            layouts={layouts}
            selectedId={selectedId}
            pickedTargetPlanetId={pickedTargetPlanetId}
            ownedPlanetIds={ownedPlanetIds}
            canPickPlanet={canPickPlanet}
            isPicking={isPicking}
            onPickPlanet={onPickPlanet}
            onSelectPlanet={selectPlanet}
          />

          {/* Ship markers use the shared Cosmic Atlas hull set near parking orbit or on trails. */}
          <CombatEffectsLayer
            markers={shipMarkerSnapshots}
            contacts={visibleFleetContacts}
            now={now}
          />
          <ShipMarkers
            markers={shipMarkerSnapshots}
            isPicking={isPicking}
            selectedShipId={
              selectedShip?.kind === "own" ? selectedShip.id : null
            }
            onSelectShip={selectOwnShip}
          />

          <FleetContactMarkers
            contacts={visibleFleetContacts}
            isPicking={isPicking}
            now={now}
            selectedContactId={
              selectedTacticalContact ? selectedShip?.id ?? null : null
            }
            onSelectContact={selectTacticalContact}
          />

          {/* Draft course for expedition launcher (vector from home star, shown from launch planet). */}
          {expeditionPick &&
            (() => {
              const launch =
                expeditionPick.routeStartPoint ??
                (expeditionPick.launchPlanetId
                  ? layoutByPlanetId.get(expeditionPick.launchPlanetId)
                  : null);
              const targetPlanet = expeditionPick.targetPlanetId
                ? layoutByPlanetId.get(expeditionPick.targetPlanetId)
                : null;
              if (!launch) return null;

              const { sectorDx, sectorDy } = expeditionPick;
              const h = Math.hypot(sectorDx, sectorDy);

              let endX: number;
              let endY: number;

              if (expeditionPick.targetPoint) {
                endX = expeditionPick.targetPoint.x;
                endY = expeditionPick.targetPoint.y;
              } else if (targetPlanet) {
                endX = targetPlanet.x;
                endY = targetPlanet.y;
              } else {
                if (h < 1e-6) return null;
                const wPerLy =
                  expeditionPick.worldUnitsPerLy ??
                  SYSTEM_MAP_WORLD_UNITS_PER_LY;
                const endpoint = sectorDeltaToSystemMapPoint(
                  { x: launch.x, y: launch.y },
                  sectorDx,
                  sectorDy,
                  wPerLy,
                );
                endX = endpoint.x;
                endY = endpoint.y;
              }
              return (
                <DraftExpeditionTrail
                  key="expedition-draft-trail"
                  launch={launch}
                  target={{ x: endX, y: endY }}
                />
              );
            })()}

          {/* Expedition trails */}
          <ExpeditionTrailLayer segments={expeditionTrailSegments} />
        </div>
      </div>

      {/* Empty-state hint when the system has no planets at all. */}
      {layouts.length === 0 && emptyStateLabel !== null && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            color: "var(--text-dim)",
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            letterSpacing: "0.18em",
            pointerEvents: "none",
          }}
        >
          {(emptyStateLabel ?? t("map.noPlanets")).toUpperCase()}
        </div>
      )}

      {/* Reset zoom (top-right, below the page header) */}
      <button
        type="button"
        onClick={resetView}
        style={{
          position: "absolute",
          top: 70,
          right: 12,
          padding: "6px 10px",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.1em",
          color: "var(--text)",
          background: "rgba(14,20,36,0.85)",
          border: "1px solid var(--line)",
          borderRadius: 6,
          backdropFilter: "blur(8px)",
          zIndex: 5,
          pointerEvents: "auto",
        }}
      >
        {t("map.resetZoom", {
          scale: (transform.scale / DISPLAY_SCALE_FACTOR).toFixed(2),
        }).toUpperCase()}
      </button>

      {!expeditionPick && selectedMapShip ? (
        <SelectedMapShipCard
          selection={selectedMapShip}
          ownShip={selectedOwnShip}
          contact={selectedTacticalContact}
          shipType={selectedShipType}
          activeExpedition={selectedOwnShipExpedition}
          onAction={onOwnShipAction}
          onClose={() => setSelectedShip(null)}
        />
      ) : null}

      {/* Selected planet info card */}
      {!expeditionPick && selected && !selectedMapShip && (
        <div
          className="cosmic-selection-card animate-in slide-in-from-bottom-4 duration-300"
          data-testid="selection-card"
          style={{
            position: "absolute",
            left: "50%",
            bottom: 110,
            transform: "translateX(-50%)",
            width: "calc(100% - 32px)",
            maxWidth: 360,
            padding: "12px 14px",
            border: selectedIsForeignColony
              ? "1px solid rgba(248,113,113,0.58)"
              : "1px solid var(--line-strong)",
            borderRadius: 12,
            background: selectedIsForeignColony
              ? "rgba(36,12,20,0.93)"
              : "rgba(14,20,36,0.92)",
            backdropFilter: "blur(10px)",
            color: "var(--text)",
            zIndex: 5,
            pointerEvents: "auto",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              letterSpacing: "0.2em",
              color:
                BIOME_META[
                  resolveBiome(
                    selected.planet.isDiscovered !== false
                      ? selected.planet.biome
                      : "unknown",
                  )
                ].accent,
              marginBottom: 4,
            }}
          >
            {t("map.selected").toUpperCase()} ·{" "}
            {getBiomeTag(
              selected.planet.isDiscovered !== false
                ? selected.planet.biome
                : "unknown",
              locale,
            )}
          </div>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 17,
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
            {selected.planet.isDiscovered !== false
              ? selected.planet.name
              : t("map.unmappedPlanet")}
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 8,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              padding: "4px 0",
              borderTop: "1px solid var(--line)",
            }}
          >
            <span style={{ color: "var(--text-dim)", letterSpacing: "0.05em" }}>
              {t("map.size")}
            </span>
            <b style={{ color: "var(--text)", fontWeight: 600 }}>
              {selected.planet.isDiscovered !== false
                ? selected.planet.size
                : "???"}
            </b>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 8,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              padding: "4px 0",
              borderTop: "1px solid var(--line)",
            }}
          >
            <span style={{ color: "var(--text-dim)", letterSpacing: "0.05em" }}>
              {t("planet.slots")}
            </span>
            <b style={{ color: "var(--text)", fontWeight: 600 }}>
              {selected.planet.isDiscovered !== false
                ? (selected.planet.buildings?.length ?? 0)
                : 0}{" "}
              /{" "}
              {selected.planet.isDiscovered !== false
                ? (selected.planet.slotCount ?? 0)
                : "???"}
            </b>
          </div>
          {selectedIsForeignColony ? (
            <div
              data-testid="hostile-colony-notice"
              style={{
                marginTop: 8,
                border: "1px solid rgba(248,113,113,0.36)",
                borderRadius: 8,
                background: "rgba(127,29,29,0.24)",
                color: "#fecaca",
                padding: "8px 9px",
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                lineHeight: 1.35,
                letterSpacing: "0.04em",
              }}
            >
              <b style={{ color: "#fca5a5" }}>
                {t("map.foreignColony").toUpperCase()}
              </b>
              <div style={{ marginTop: 3 }}>
                {t("map.bombardBeforeColonize")}
              </div>
            </div>
          ) : null}
          <div
            style={{
              marginTop: 8,
              borderTop: "1px solid var(--line)",
              paddingTop: 8,
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.08em",
                color: "var(--text-dim)",
                marginBottom: 6,
              }}
            >
              {t("map.mineableResources").toUpperCase()}
            </div>
            {mineableResources.length === 0 ? (
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--text-faint)",
                }}
              >
                {t("map.noMineableResources")}
              </div>
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                {mineableResources.map((resource) => (
                  <div
                    key={resource.resourceId}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 10,
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                      color: "var(--text)",
                    }}
                  >
                    <span
                      style={{ display: "flex", alignItems: "center", gap: 6 }}
                    >
                      <ResourceIcon
                        resourceId={resource.resourceId}
                        size={16}
                      />
                      {getResourceLabel(resource.resourceId, locale)}
                    </span>
                    <span style={{ color: "var(--text-dim)" }}>
                      {t("map.deposit", { value: resource.richness ?? 0 })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {!selectedIsForeignColony ? (
            <button
              type="button"
              disabled={selected.planet.isDiscovered === false}
              onClick={() => {
                if (selectedIsOwnedPlanet) {
                  onPlanetClick(selected.planet);
                } else {
                  if (onColonizeClick) {
                    onColonizeClick(selected.planet);
                  } else {
                    setIsColonyDialogOpen(true);
                  }
                }
              }}
              className="cosmic-cta"
              data-testid="colonize-button"
              style={{
                width: "100%",
                marginTop: 10,
                padding: "10px 14px",
                opacity: selected.planet.isDiscovered === false ? 0.5 : 1,
              }}
            >
              {selected.planet.isDiscovered === false
                ? t("map.discoveryRequired")
                : selectedIsOwnedPlanet
                  ? t("map.openPlanet")
                  : t("map.sendColonizer")}
            </button>
          ) : null}
        </div>
      )}

      {!expeditionPick && selected && (
        <FoundColonyDialog
          isOpen={isColonyDialogOpen}
          onClose={() => setIsColonyDialogOpen(false)}
          planet={selected.planet}
          onSuccess={() => {
            // Success handler
          }}
        />
      )}
    </div>
  );
}
