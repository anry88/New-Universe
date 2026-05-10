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
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { HomeSystem, Planet } from '@shared/types/world';
import type { Ship } from '@shared/types/ships';
import type { Expedition } from '@shared/types/expeditions';
import { BIOME_META, PlanetSvg, resolveBiome } from './planets';
import { SunSvg } from './sun';
import { FoundColonyDialog } from '../FoundColonyDialog';

/** When set, the map is used to pick a sector jump vector from the home star: tap = set course, drag = pan. */
export interface ExpeditionPickConfig {
  /** Integer sector delta from home (X/Y galactic grid). */
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
  ownedPlanetIds: Set<string>;
  expeditionPick?: ExpeditionPickConfig;
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

const ORBIT_BASE = 90;
const ORBIT_STEP = 70;
const MIN_SCALE = 0.3;
const MAX_SCALE = 4;
/** Below this drag distance (CSS px), a one-finger gesture counts as a tap for expedition aiming. */
const EXPEDITION_TAP_THRESHOLD_PX = 14;
const DEFAULT_WORLD_UNITS_PER_LY = 40;

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
  const distInt = Math.max(1, Math.round(ly));
  return {
    dx: Math.round(distInt * Math.cos(angle)),
    dy: Math.round(distInt * Math.sin(angle)),
  };
}

/** Stable pseudo-random angle so a planet always sits in the same orbital
 *  slot across renders. */
function planetAngle(planet: Planet, index: number, systemSeed: number): number {
  const seed = (systemSeed | 0) + index * 1009 + (planet.id?.charCodeAt(0) ?? 0);
  let s = seed || 1;
  s = (s * 9301 + 49297) % 233280;
  return (s / 233280) * Math.PI * 2 + (index % 2 === 0 ? 0 : Math.PI / 6);
}

export function CosmicSystemRenderer({
  system,
  ships,
  expeditions,
  onPlanetClick,
  ownedPlanetIds,
  expeditionPick,
}: CosmicSystemRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [now, setNow] = useState(Date.now());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pointerCount, setPointerCount] = useState(0);
  const [isColonyDialogOpen, setIsColonyDialogOpen] = useState(false);
  /** Expedition mode: defer pan until finger moves past tap threshold so taps can aim. */
  const expeditionPanArmRef = useRef<{ exceeded: boolean; startX: number; startY: number } | null>(null);
  const expeditionDraftGradId = useId().replace(/:/g, '');

  // ----- Layout ----------------------------------------------------------

  const layouts = useMemo<PlanetLayout[]>(() => {
    const seed = Number(system?.seed) || 1;
    const planets = system?.planets ?? [];
    return planets.map((planet, index) => {
      const orbitRadius = ORBIT_BASE + index * ORBIT_STEP;
      const angle = planetAngle(planet, index, seed);
      const x = Math.cos(angle) * orbitRadius;
      const y = Math.sin(angle) * orbitRadius;
      const sizeFromBiome =
        planet.isDiscovered === false
          ? 60
          : planet.biome === 'gas_giant'
          ? 70
          : 52;
      const spriteSize = Math.round(
        sizeFromBiome * (0.85 + Math.min(0.6, (planet.size ?? 10) / 20))
      );
      return { planet, index, orbitRadius, angle, x, y, spriteSize };
    });
  }, [system]);

  const selected = useMemo(
    () => (selectedId ? layouts.find((l) => l.planet.id === selectedId) ?? null : null),
    [layouts, selectedId]
  );

  // ----- Pan / pinch / wheel --------------------------------------------

  const dragState = useRef({
    pointerId: null as number | null,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    pinchStartDist: 0,
    pinchStartScale: 1,
    pointers: new Map<number, { x: number; y: number }>(),
  });

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = containerRef.current;
      if (!el) return;
      el.setPointerCapture(e.pointerId);
      dragState.current.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      setPointerCount(dragState.current.pointers.size);
      if (expeditionPick && dragState.current.pointers.size === 1) {
        expeditionPanArmRef.current = { exceeded: false, startX: e.clientX, startY: e.clientY };
      }
      if (dragState.current.pointers.size === 1) {
        dragState.current.pointerId = e.pointerId;
        dragState.current.startX = e.clientX;
        dragState.current.startY = e.clientY;
        dragState.current.originX = transform.x;
        dragState.current.originY = transform.y;
      } else if (dragState.current.pointers.size === 2) {
        expeditionPanArmRef.current = null;
        const pts = Array.from(dragState.current.pointers.values());
        const dx = pts[0].x - pts[1].x;
        const dy = pts[0].y - pts[1].y;
        dragState.current.pinchStartDist = Math.hypot(dx, dy);
        dragState.current.pinchStartScale = transform.scale;
      }
    },
    [transform, expeditionPick]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragState.current.pointers.has(e.pointerId)) return;
      dragState.current.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (dragState.current.pointers.size === 2) {
        expeditionPanArmRef.current = null;
        const pts = Array.from(dragState.current.pointers.values());
        const dx = pts[0].x - pts[1].x;
        const dy = pts[0].y - pts[1].y;
        const dist = Math.hypot(dx, dy) || 1;
        const ratio = dist / Math.max(1, dragState.current.pinchStartDist);
        const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, dragState.current.pinchStartScale * ratio));
        setTransform((t) => ({ ...t, scale: newScale }));
      } else if (e.pointerId === dragState.current.pointerId) {
        if (
          expeditionPick &&
          expeditionPanArmRef.current &&
          !expeditionPanArmRef.current.exceeded &&
          dragState.current.pointers.size === 1
        ) {
          const arm = expeditionPanArmRef.current;
          const moved = Math.hypot(e.clientX - arm.startX, e.clientY - arm.startY);
          
          // Real-time aiming update
          const wPerLy = expeditionPick.worldUnitsPerLy ?? DEFAULT_WORLD_UNITS_PER_LY;
          const { wx, wy } = clientToWorldCoords(containerRef.current!, transform, e.clientX, e.clientY);
          const launch = layouts.find((l) => l.planet.id === expeditionPick!.launchPlanetId);
          const { dx, dy } = worldRayToSectorDelta(wx, wy, launch?.x ?? 0, launch?.y ?? 0, wPerLy);
          expeditionPick.onPickSectorDelta(dx, dy);

          if (moved < EXPEDITION_TAP_THRESHOLD_PX) {
            return;
          }
          
          // If we moved significantly, check if we should switch to pan or stay in aim
          // If the drag started near the launch planet, we treat it as 'drag to aim' and stay.
          // Otherwise we switch to panning.
          const { wx: swx, wy: swy } = clientToWorldCoords(containerRef.current!, transform, arm.startX, arm.startY);
          const distFromLaunch = Math.hypot(swx - (launch?.x ?? 0), swy - (launch?.y ?? 0));
          
          if (distFromLaunch < 100) { // started near launch
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
    [expeditionPick, transform.x, transform.y],
  );

  // Tick for movement animations
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = containerRef.current;
      const pickCfg = expeditionPick;
      const arm = expeditionPanArmRef.current;
      const movedFromDown =
        arm != null ? Math.hypot(e.clientX - arm.startX, e.clientY - arm.startY) : Infinity;
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
        const wPerLy = pickCfg.worldUnitsPerLy ?? DEFAULT_WORLD_UNITS_PER_LY;
        const { wx, wy } = clientToWorldCoords(el, transform, e.clientX, e.clientY);
        const launch = layouts.find((l) => l.planet.id === pickCfg.launchPlanetId);
        const { dx, dy } = worldRayToSectorDelta(wx, wy, launch?.x ?? 0, launch?.y ?? 0, wPerLy);
        pickCfg.onPickSectorDelta(dx, dy);
      }

      expeditionPanArmRef.current = null;
    },
    [expeditionPick, transform, layouts],
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
        const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, t.scale * factor));
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
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  const resetView = () => setTransform({ x: 0, y: 0, scale: 1 });

  // Auto-fit: when the system loads, choose a starting scale that fits the
  // outermost orbit comfortably inside the visible area. Keeps the home
  // system visible on first paint without requiring the user to zoom out.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || layouts.length === 0) return;
    const outerRadius = ORBIT_BASE + (layouts.length - 1) * ORBIT_STEP + 60;
    const rect = el.getBoundingClientRect();
    const minSide = Math.min(rect.width, rect.height);
    if (minSide <= 0) return;
    const fitScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, (minSide * 0.9) / (outerRadius * 2)));
    setTransform({ x: 0, y: 0, scale: fitScale });
    // run once per system
  }, [layouts.length]);

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
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        touchAction: 'none',
        cursor:
          expeditionPick && pointerCount === 0 ? 'crosshair' : pointerCount > 0 ? 'grabbing' : 'grab',
        background:
          'radial-gradient(ellipse at 50% 50%, rgba(91,215,255,0.06), transparent 60%), #050811',
      }}
    >
      {/* Centring frame — guarantees the world wrapper is at the visual
          centre even if the parent has weird sizing. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none', // the container above handles pointer events
        }}
      >
        <div
          style={{
            position: 'relative',
            width: 0,
            height: 0,
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            transformOrigin: '0 0',
            willChange: 'transform',
            pointerEvents: 'none',
          }}
        >
          {/* Orbit rings */}
          {layouts.map((l) => (
            <div
              key={`orbit-${l.planet.id}`}
              style={{
                position: 'absolute',
                left: -l.orbitRadius,
                top: -l.orbitRadius,
                width: l.orbitRadius * 2,
                height: l.orbitRadius * 2,
                border: '1px dashed rgba(150,175,220,0.18)',
                borderRadius: '50%',
                pointerEvents: expeditionPick ? 'none' : 'auto',
              }}
            />
          ))}

          {/* Sun */}
          <div
            style={{
              position: 'absolute',
              left: -56,
              top: -56,
              width: 112,
              height: 112,
              pointerEvents: expeditionPick ? 'none' : 'auto',
            }}
          >
            <SunSvg size={112} />
          </div>

          {/* Planets */}
          {layouts.map((l) => {
            const isDiscovered = l.planet.isDiscovered !== false;
            const biome = resolveBiome(l.planet.biome);
            const meta = BIOME_META[biome];
            const isSelected = l.planet.id === selectedId || expeditionPick?.targetPlanetId === l.planet.id;
            
            if (!isDiscovered) {
               return (
                 <button
                   key={l.planet.id}
                   type="button"
                   onClick={(e) => {
                     e.stopPropagation();
                     setSelectedId(l.planet.id);
                     if (expeditionPick?.onPickPlanet) {
                        expeditionPick.onPickPlanet(l.planet.id);
                     }
                   }}
                   style={{
                     position: 'absolute',
                     left: l.x - 12,
                     top: l.y - 12,
                     width: 24,
                     height: 24,
                     background: isSelected ? 'rgba(91,215,255,0.3)' : 'transparent',
                     border: isSelected ? '1px solid var(--accent)' : '1px dashed rgba(255,255,255,0.2)',
                     borderRadius: '50%',
                     padding: 0,
                     cursor: 'pointer',
                     pointerEvents: 'auto',
                     display: 'flex',
                     alignItems: 'center',
                     justifyContent: 'center',
                     zIndex: 5,
                   }}
                 >
                   <span style={{ fontSize: 10, color: isSelected ? 'var(--accent)' : 'rgba(255,255,255,0.4)', fontWeight: 800 }}>?</span>
                 </button>
               );
            }

            return (
              <button
                key={l.planet.id}
                type="button"
                data-testid={`planet-btn-${l.planet.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (expeditionPick?.onPickPlanet) {
                     expeditionPick.onPickPlanet(l.planet.id);
                  }
                  setSelectedId(l.planet.id);
                }}
                style={{
                  position: 'absolute',
                  left: l.x - l.spriteSize / 2,
                  top: l.y - l.spriteSize / 2,
                  width: l.spriteSize,
                  height: l.spriteSize,
                  background: 'transparent',
                  border: 0,
                  padding: 0,
                  cursor: expeditionPick ? 'inherit' : 'pointer',
                  pointerEvents: expeditionPick ? 'none' : 'auto',
                  filter: isSelected
                    ? `drop-shadow(0 0 10px ${meta.accent})`
                    : 'drop-shadow(0 6px 14px rgba(0,0,0,0.5))',
                }}
              >
                <PlanetSvg biome={biome} size={l.spriteSize} uid={`map-${l.planet.id}`} />
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: '50%',
                    transform: 'translate(-50%, 4px)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9,
                    letterSpacing: '0.1em',
                    color: isSelected ? meta.accent : 'var(--text-dim)',
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                    textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                  }}
                >
                  {(l.planet.name || '?').toUpperCase()}
                </div>
              </button>
            );
          })}

          {/* Ship markers — small green chevron just outside parking orbit or on trail */}
          {ships.map((ship, shipIdx) => {
            if (!['idle', 'moving'].includes(ship.status) || !ship.locationPlanetId) return null;
            const layout = layouts.find((l) => l.planet.id === ship.locationPlanetId);
            if (!layout) return null;

            let sx, sy, angle = 0;
            let isMoving = false;
            let isReturning = false;

            if (ship.status === 'moving') {
              const exp = expeditions.find(e => e.shipId === ship.id && (e.status === 'in_flight' || e.status === 'returning'));
              if (exp && exp.result && typeof exp.result === 'object') {
                const res = exp.result as Record<string, number>;
                if (res.distance && res.speed) {
                  const durationMs = (res.distance * 60 / res.speed) * (res.engineFactor || 1) * 1000;
                  const etaMs = new Date(exp.eta).getTime();
                  let progress = 0;
                  if (exp.status === 'in_flight') {
                    progress = 1 - (etaMs - now) / durationMs;
                  } else {
                    progress = (etaMs - now) / durationMs;
                    isReturning = true;
                  }
                  progress = Math.max(0, Math.min(1, progress));

                  const targetAngle = Math.atan2(
                    Number(exp.targetY) - system.sectorY,
                    Number(exp.targetX) - system.sectorX
                  );
                  const trailLength = 600;
                  const endX = Math.cos(targetAngle) * trailLength;
                  const endY = Math.sin(targetAngle) * trailLength;

                  sx = layout.x + (endX - layout.x) * progress;
                  sy = layout.y + (endY - layout.y) * progress;
                  angle = targetAngle + (isReturning ? Math.PI : 0);
                  isMoving = true;
                }
              }
            }

            if (!isMoving) {
              const r = layout.orbitRadius + 22;
              const a = layout.angle + 0.18 + shipIdx * 0.06;
              sx = Math.cos(a) * r;
              sy = Math.sin(a) * r;
              angle = a + Math.PI / 2;
            }

            return (
              <div
                key={ship.id}
                style={{
                  position: 'absolute',
                  left: sx! - 8,
                  top: sy! - 8,
                  width: 16,
                  height: 16,
                  color: isMoving ? (isReturning ? '#F4B84A' : '#5BD7FF') : '#5BFFA9',
                  transform: `rotate(${angle}rad)`,
                  filter: isMoving ? 'drop-shadow(0 0 4px currentColor)' : 'none',
                  pointerEvents: expeditionPick ? 'none' : 'auto',
                  transition: 'left 1s linear, top 1s linear',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <polygon points="0,0 16,8 0,16 4,8" />
                </svg>
                {isMoving && (
                  <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: '50%',
                    transform: 'translateX(-50%) rotate(${-angle}rad)',
                    fontSize: 8,
                    fontFamily: 'var(--font-mono)',
                    color: 'currentColor',
                    whiteSpace: 'nowrap',
                    marginTop: 4,
                  }}>
                    {isReturning ? 'RETURNING' : 'IN FLIGHT'}
                  </div>
                )}
              </div>
            );
          })}

          {/* Draft course for expedition launcher (vector from home star, shown from launch planet). */}
          {expeditionPick &&
            (() => {
              const launch = layouts.find((l) => l.planet.id === expeditionPick.launchPlanetId);
              const targetPlanet = layouts.find((l) => l.planet.id === expeditionPick.targetPlanetId);
              if (!launch) return null;

              const { sectorDx, sectorDy } = expeditionPick;
              const angle = Math.atan2(sectorDy, sectorDx);
              const h = Math.hypot(sectorDx, sectorDy);

              let trailLength: number;
              let endX: number;
              let endY: number;

              if (targetPlanet) {
                endX = targetPlanet.x;
                endY = targetPlanet.y;
                trailLength = Math.hypot(endX - launch.x, endY - launch.y);
              } else {
                if (h < 1e-6) return null;
                trailLength = Math.min(700, 56 + h * 14);
                endX = launch.x + Math.cos(angle) * trailLength;
                endY = launch.y + Math.sin(angle) * trailLength;
              }
              const svgPad = trailLength + 80;
              return (
                <svg
                  key="expedition-draft-trail"
                  style={{
                    position: 'absolute',
                    left: launch.x - svgPad,
                    top: launch.y - svgPad,
                    width: svgPad * 2,
                    height: svgPad * 2,
                    pointerEvents: 'none',
                    zIndex: 3,
                  }}
                  viewBox={`${-svgPad} ${-svgPad} ${svgPad * 2} ${svgPad * 2}`}
                >
                  <defs>
                    <linearGradient id={`exp-draft-line-${expeditionDraftGradId}`} x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#5BD7FF" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0.75} />
                    </linearGradient>
                  </defs>
                  <line
                    x1={0}
                    y1={0}
                    x2={endX - launch.x}
                    y2={endY - launch.y}
                    stroke={`url(#exp-draft-line-${expeditionDraftGradId})`}
                    strokeWidth={2.5}
                    strokeDasharray="10 6"
                    opacity={0.92}
                  />
                  <circle
                    cx={endX - launch.x}
                    cy={endY - launch.y}
                    r={9}
                    fill="none"
                    stroke="#a5b4fc"
                    strokeWidth={2}
                  />
                  <circle cx={endX - launch.x} cy={endY - launch.y} r={4} fill="#c7d2fe" />
                </svg>
              );
            })()}

          {/* Expedition trails */}
          {expeditions.map((exp) => {
            const origin = layouts.find((l) => l.planet.id === exp.originPlanetId);
            if (!origin) return null;
            const targetAngle = Math.atan2(
              Number(exp.targetY) - system.sectorY,
              Number(exp.targetX) - system.sectorX
            );
            const trailLength = 600;
            const endX = Math.cos(targetAngle) * trailLength;
            const endY = Math.sin(targetAngle) * trailLength;
            return (
              <svg
                key={exp.id}
                style={{
                  position: 'absolute',
                  left: -trailLength,
                  top: -trailLength,
                  width: trailLength * 2,
                  height: trailLength * 2,
                  pointerEvents: 'none',
                }}
                viewBox={`${-trailLength} ${-trailLength} ${trailLength * 2} ${trailLength * 2}`}
              >
                <line
                  x1={origin.x}
                  y1={origin.y}
                  x2={endX}
                  y2={endY}
                  stroke="#F4B84A"
                  strokeWidth={1.2}
                  strokeDasharray="6 6"
                  opacity={0.55}
                />
              </svg>
            );
          })}
        </div>
      </div>

      {/* Empty-state hint when the system has no planets at all. */}
      {layouts.length === 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            color: 'var(--text-dim)',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            letterSpacing: '0.18em',
            pointerEvents: 'none',
          }}
        >
          NO PLANETS IN THIS SYSTEM
        </div>
      )}

      {/* Legend (fixed bottom-left, above the bottom nav) */}
      {!expeditionPick ? (
        <div
          style={{
            position: 'absolute',
            left: 12,
            bottom: 96,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            padding: '8px 10px',
            background: 'rgba(8,12,22,0.85)',
            border: '1px solid var(--line)',
            borderRadius: 8,
            backdropFilter: 'blur(8px)',
            pointerEvents: 'none',
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            letterSpacing: '0.05em',
            color: 'var(--text-dim)',
            zIndex: 5,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: '#5BFFA9',
                boxShadow: '0 0 6px #5BFFA9',
              }}
            />
            Idle ship
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 7, height: 2, background: '#F4B84A' }} />
            Expedition trail
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 7,
                height: 7,
                border: '1px dashed rgba(150,175,220,0.4)',
                borderRadius: '50%',
              }}
            />
            Orbit
          </div>
        </div>
      ) : null}

      {/* Reset zoom (top-right, below the page header) */}
      <button
        type="button"
        onClick={resetView}
        style={{
          position: 'absolute',
          top: 70,
          right: 12,
          padding: '6px 10px',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          letterSpacing: '0.1em',
          color: 'var(--text)',
          background: 'rgba(14,20,36,0.85)',
          border: '1px solid var(--line)',
          borderRadius: 6,
          backdropFilter: 'blur(8px)',
          zIndex: 5,
          pointerEvents: 'auto',
        }}
      >
        RESET · {transform.scale.toFixed(2)}×
      </button>

      {/* Selected planet info card */}
      {!expeditionPick && selected && (
        <div
          className="cosmic-selection-card animate-in slide-in-from-bottom-4 duration-300"
          data-testid="selection-card"
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 110,
            transform: 'translateX(-50%)',
            width: 'calc(100% - 32px)',
            maxWidth: 360,
            padding: '12px 14px',
            border: '1px solid var(--line-strong)',
            borderRadius: 12,
            background: 'rgba(14,20,36,0.92)',
            backdropFilter: 'blur(10px)',
            color: 'var(--text)',
            zIndex: 5,
            pointerEvents: 'auto',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              letterSpacing: '0.2em',
              color: BIOME_META[resolveBiome(selected.planet.biome)].accent,
              marginBottom: 4,
            }}
          >
            SELECTED · {BIOME_META[resolveBiome(selected.planet.biome)].tag}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 17,
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
            {selected.planet.name}
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 8,
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              padding: '4px 0',
              borderTop: '1px solid var(--line)',
            }}
          >
            <span style={{ color: 'var(--text-dim)', letterSpacing: '0.05em' }}>Size</span>
            <b style={{ color: 'var(--text)', fontWeight: 600 }}>{selected.planet.size}</b>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 8,
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              padding: '4px 0',
              borderTop: '1px solid var(--line)',
            }}
          >
            <span style={{ color: 'var(--text-dim)', letterSpacing: '0.05em' }}>Slots</span>
            <b style={{ color: 'var(--text)', fontWeight: 600 }}>
              {selected.planet.buildings?.length ?? 0} / {selected.planet.slotCount ?? 0}
            </b>
          </div>
          <button
            type="button"
            disabled={selected.planet.isDiscovered === false}
            onClick={() => {
              if (ownedPlanetIds.has(selected.planet.id)) {
                onPlanetClick(selected.planet);
              } else {
                setIsColonyDialogOpen(true);
              }
            }}
            className="cosmic-cta"
            data-testid="colonize-button"
            style={{
              width: '100%',
              marginTop: 10,
              padding: '10px 14px',
              opacity: selected.planet.isDiscovered === false ? 0.5 : 1,
            }}
          >
            {selected.planet.isDiscovered === false
              ? 'Discovery Required'
              : ownedPlanetIds.has(selected.planet.id)
              ? 'Open planet'
              : 'Colonize'}
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
