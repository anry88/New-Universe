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
import type { HomeSystem, Planet } from "@shared/types/world";
import type { Ship } from "@shared/types/ships";
import type { Expedition } from "@shared/types/expeditions";
import {
  buildSystemMapLayouts,
  buildSystemMapOrbitGuideRadii,
  sectorDeltaToSystemMapPoint,
  SYSTEM_MAP_WORLD_UNITS_PER_LY,
} from "@shared/format/systemMapLayout";
import { BIOME_META, PlanetSvg, getBiomeTag, resolveBiome } from "./planets";
import { SunSvg } from "./sun";
import { FoundColonyDialog } from "../FoundColonyDialog";
import { useI18n } from "../../lib/i18n";
import { getResourceLabel, getResourceSymbol } from "./resources";
import { ShipIcon } from "./ships";

/** When set, the map is used to pick a sector jump vector from the home star: tap = set course, drag = pan. */
export interface ExpeditionPickConfig {
  /** Sector delta from home (X/Y galactic grid). */
  sectorDx: number;
  sectorDy: number;
  /** Trail starts at this planet (launch site). */
  launchPlanetId: string;
  /** Set when targeting a specific local body (e.g. for Survey or Colonize). */
  targetPlanetId?: string | null;
  /** World-map pixels per sector light-year along the aim ray (tuning for comfortable reach). */
  worldUnitsPerLy?: number;
  onPickSectorDelta: (dx: number, dy: number) => void;
  onPickPlanet?: (planetId: string) => void;
}

interface CosmicSystemRendererProps {
  system: HomeSystem;
  ships: Ship[];
  expeditions: Expedition[];
  onPlanetClick: (planet: Planet) => void;
  onColonizeClick?: (planet: Planet) => void;
  ownedPlanetIds: Set<string>;
  expeditionPick?: ExpeditionPickConfig;
  jumpGate?: JumpGateMarkerConfig | null;
}

interface PlanetLayout {
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
}

const MIN_SCALE = 0.1;
const MAX_SCALE = 5;
const DISPLAY_SCALE_FACTOR = 0.3;
const SHIP_MARKER_TICK_MS = 2500;
const PICK_DELTA_EPSILON = 0.03;

/** Below this drag distance (CSS px), a one-finger gesture counts as a tap for expedition aiming. */
const EXPEDITION_TAP_THRESHOLD_PX = 14;

function isDiscoveredPlanet(planet: Planet): boolean {
  return planet.isDiscovered !== false;
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
}: RouteLineProps) {
  const length = Math.hypot(x2 - x1, y2 - y1);
  if (length < 1) return null;

  return (
    <div
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

function buildExpeditionTrailSegments(
  activeExpeditions: Expedition[],
  layoutByPlanetId: Map<string, PlanetLayout>,
  system: HomeSystem,
): ExpeditionTrailSegment[] {
  return activeExpeditions.flatMap((exp) => {
    const origin = layoutByPlanetId.get(exp.originPlanetId);
    if (!origin) return [];

    const targetPlanet = exp.targetPlanetId
      ? layoutByPlanetId.get(exp.targetPlanetId)
      : null;
    const endpoint = targetPlanet
      ? { x: targetPlanet.x, y: targetPlanet.y }
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
  canPickPlanet: boolean;
  isPicking: boolean;
  onPickPlanet?: (planetId: string) => void;
  onSelectPlanet: (planetId: string) => void;
}

const PlanetMarkers = React.memo(function PlanetMarkers({
  layouts,
  selectedId,
  pickedTargetPlanetId,
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
              filter: isSelected
                ? `drop-shadow(0 0 10px ${meta.accent})`
                : "drop-shadow(0 6px 14px rgba(0,0,0,0.5))",
            }}
          >
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
                color: isSelected ? meta.accent : "var(--text-dim)",
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

const ShipMarkers = React.memo(function ShipMarkers({
  ships,
  activeExpeditions,
  layoutByPlanetId,
  system,
  isPicking,
}: {
  ships: Ship[];
  activeExpeditions: Expedition[];
  layoutByPlanetId: Map<string, PlanetLayout>;
  system: HomeSystem;
  isPicking: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  const hasMovingShips =
    activeExpeditions.length > 0 &&
    ships.some((ship) => ship.status === "moving");
  const expeditionByShipId = useMemo(
    () => new Map(activeExpeditions.map((exp) => [exp.shipId, exp])),
    [activeExpeditions],
  );

  useEffect(() => {
    if (!hasMovingShips) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), SHIP_MARKER_TICK_MS);
    return () => clearInterval(timer);
  }, [hasMovingShips, activeExpeditions]);

  return (
    <>
      {ships.map((ship, shipIdx) => {
        if (!["idle", "moving"].includes(ship.status) || !ship.locationPlanetId)
          return null;
        const layout = layoutByPlanetId.get(ship.locationPlanetId);
        if (!layout) return null;

        let sx,
          sy,
          angle = 0;
        let isMoving = false;
        let isReturning = false;

        if (ship.status === "moving") {
          const exp = expeditionByShipId.get(ship.id);
          if (exp && exp.result && typeof exp.result === "object") {
            const res = exp.result as Record<string, number>;
            if (res.distance !== undefined && res.speed) {
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

              const targetPlanet = exp.targetPlanetId
                ? layoutByPlanetId.get(exp.targetPlanetId)
                : null;
              let endX: number;
              let endY: number;
              if (targetPlanet) {
                endX = targetPlanet.x;
                endY = targetPlanet.y;
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
              sx = layout.x + (endX - layout.x) * progress;
              sy = layout.y + (endY - layout.y) * progress;

              angle = targetAngle + (isReturning ? Math.PI : 0);
              isMoving = true;
            }
          }
        }

        if (!isMoving) {
          const r = layout.orbitRadius + layout.spriteSize / 2 + 14;
          const a = layout.angle + 0.18 + shipIdx * 0.06;
          sx = Math.cos(a) * r;
          sy = Math.sin(a) * r;
          angle = a + Math.PI / 2;
        }

        const tone = isMoving
          ? isReturning
            ? "#F4B84A"
            : "#5BD7FF"
          : "#5BFFA9";

        return (
          <div
            key={ship.id}
            style={{
              position: "absolute",
              left: sx! - 12,
              top: sy! - 12,
              width: 24,
              height: 24,
              color: tone,
              transform: `rotate(${angle}rad)`,
              filter: isMoving
                ? "drop-shadow(0 0 6px currentColor)"
                : "drop-shadow(0 0 4px rgba(91,255,169,0.4))",
              pointerEvents: isPicking ? "none" : "auto",
              transition: isMoving
                ? `left ${SHIP_MARKER_TICK_MS}ms linear, top ${SHIP_MARKER_TICK_MS}ms linear`
                : "none",
            }}
          >
            <ShipIcon typeId={ship.typeId} size={24} tone="currentColor" />
          </div>
        );
      })}
    </>
  );
});

const DraftExpeditionTrail = React.memo(function DraftExpeditionTrail({
  launch,
  target,
}: {
  launch: PlanetLayout;
  target: { x: number; y: number };
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
  expeditions,
  onPlanetClick,
  onColonizeClick,
  ownedPlanetIds,
  expeditionPick,
  jumpGate,
}: CosmicSystemRendererProps) {
  const { locale, t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 0.3 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
    () =>
      expeditions.filter(
        (exp) => exp.status === "in_flight" || exp.status === "returning",
      ),
    [expeditions],
  );

  const expeditionTrailSegments = useMemo(
    () =>
      buildExpeditionTrailSegments(activeExpeditions, layoutByPlanetId, system),
    [activeExpeditions, layoutByPlanetId, system],
  );

  const selected = useMemo(
    () =>
      selectedId
        ? (layouts.find((l) => l.planet.id === selectedId) ?? null)
        : null,
    [layouts, selectedId],
  );

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

  const orbitRadii = useMemo(() => {
    return buildSystemMapOrbitGuideRadii(system?.planets ?? []);
  }, [system?.planets]);

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
  const jumpGatePosition = useMemo(() => {
    const angle = -0.68;
    return {
      x: Math.cos(angle) * jumpGateOrbitRadius,
      y: Math.sin(angle) * jumpGateOrbitRadius,
    };
  }, [jumpGateOrbitRadius]);
  const visibleOuterRadius = jumpGate
    ? jumpGateOrbitRadius + 64
    : planetOuterRadius;
  const isPicking = Boolean(expeditionPick);
  const canPickPlanet = Boolean(expeditionPick?.onPickPlanet);
  const onPickSectorDelta = expeditionPick?.onPickSectorDelta;
  const onPickPlanet = expeditionPick?.onPickPlanet;
  const pickedTargetPlanetId = expeditionPick?.targetPlanetId ?? null;

  const selectPlanet = useCallback((planetId: string) => {
    setSelectedId(planetId);
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

  useEffect(() => {
    if (onPickSectorDelta) return;
    if (pickEmitFrameRef.current !== null) {
      window.cancelAnimationFrame(pickEmitFrameRef.current);
      pickEmitFrameRef.current = null;
    }
    pendingPickDeltaRef.current = null;
    lastPickDeltaRef.current = null;
  }, [onPickSectorDelta]);

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
        const target = e.target as HTMLElement | null;
        const isCardControl =
          target?.closest(".cosmic-selection-card") !== null ||
          target?.closest("button") !== null;
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

          // Real-time aiming update
          const wPerLy =
            expeditionPick.worldUnitsPerLy ?? SYSTEM_MAP_WORLD_UNITS_PER_LY;
          const { wx, wy } = clientToWorldCoords(
            containerRef.current!,
            transform,
            e.clientX,
            e.clientY,
          );
          const launch = layoutByPlanetId.get(expeditionPick.launchPlanetId);
          const { dx, dy } = worldRayToSectorDelta(
            wx,
            wy,
            launch?.x ?? 0,
            launch?.y ?? 0,
            wPerLy,
          );
          emitPickSectorDelta(dx, dy);

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
          const distFromLaunch = Math.hypot(
            swx - (launch?.x ?? 0),
            swy - (launch?.y ?? 0),
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
    [emitPickSectorDelta, expeditionPick, layoutByPlanetId, transform],
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
        const wPerLy = pickCfg.worldUnitsPerLy ?? SYSTEM_MAP_WORLD_UNITS_PER_LY;
        const { wx, wy } = clientToWorldCoords(
          el,
          transform,
          e.clientX,
          e.clientY,
        );
        const launch = layoutByPlanetId.get(pickCfg.launchPlanetId);
        const { dx, dy } = worldRayToSectorDelta(
          wx,
          wy,
          launch?.x ?? 0,
          launch?.y ?? 0,
          wPerLy,
        );
        emitPickSectorDelta(dx, dy, true);
      }
      if (
        !pickCfg &&
        startedWithOnePointer &&
        shouldCloseSelectionOnTapRef.current &&
        selectedId !== null &&
        movedFromDownAll < EXPEDITION_TAP_THRESHOLD_PX &&
        !wasAimTap
      ) {
        setSelectedId(null);
      }

      shouldCloseSelectionOnTapRef.current = false;

      expeditionPanArmRef.current = null;
    },
    [
      emitPickSectorDelta,
      expeditionPick,
      layoutByPlanetId,
      selectedId,
      transform,
    ],
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
          <OrbitRings orbitRadii={orbitRadii} isPicking={isPicking} />

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
            canPickPlanet={canPickPlanet}
            isPicking={isPicking}
            onPickPlanet={onPickPlanet}
            onSelectPlanet={selectPlanet}
          />

          {/* Ship markers use the shared Cosmic Atlas hull set near parking orbit or on trails. */}
          <ShipMarkers
            ships={ships}
            activeExpeditions={activeExpeditions}
            layoutByPlanetId={layoutByPlanetId}
            system={system}
            isPicking={isPicking}
          />

          {/* Draft course for expedition launcher (vector from home star, shown from launch planet). */}
          {expeditionPick &&
            (() => {
              const launch = layoutByPlanetId.get(
                expeditionPick.launchPlanetId,
              );
              const targetPlanet = expeditionPick.targetPlanetId
                ? layoutByPlanetId.get(expeditionPick.targetPlanetId)
                : null;
              if (!launch) return null;

              const { sectorDx, sectorDy } = expeditionPick;
              const h = Math.hypot(sectorDx, sectorDy);

              let endX: number;
              let endY: number;

              if (targetPlanet) {
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
      {layouts.length === 0 && (
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
          {t("map.noPlanets").toUpperCase()}
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

      {/* Selected planet info card */}
      {!expeditionPick && selected && (
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
            border: "1px solid var(--line-strong)",
            borderRadius: 12,
            background: "rgba(14,20,36,0.92)",
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
                      <b style={{ color: "var(--accent)" }}>
                        {getResourceSymbol(resource.resourceId)}
                      </b>
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
          <button
            type="button"
            disabled={selected.planet.isDiscovered === false}
            onClick={() => {
              if (ownedPlanetIds.has(selected.planet.id)) {
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
              : ownedPlanetIds.has(selected.planet.id)
                ? t("map.openPlanet")
                : t("map.sendColonizer")}
          </button>
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
