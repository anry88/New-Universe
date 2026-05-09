/**
 * Cosmic Atlas system map.
 *
 * Renders the home system as a top-down orbital diagram using the same biome
 * SVG sprites as the rest of the app — no schematic blue circles, no PixiJS
 * raster. The map is a normal HTML/SVG tree, so:
 *  - planets, sun, orbits, ship markers and expedition trails all render with
 *    crisp vectors at any zoom level;
 *  - pan / pinch-zoom is implemented with native pointer events on a single
 *    transform wrapper, which keeps interaction <1ms per frame.
 *
 * The component is API-compatible with the previous PixiJS SystemRenderer so
 * the SystemMap page can swap one for the other transparently.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { HomeSystem, Planet } from '@shared/types/world';
import type { Ship } from '@shared/types/ships';
import type { Expedition } from '@shared/types/expeditions';
import { BIOME_META, PlanetSvg, resolveBiome } from './planets';
import { SunSvg } from './sun';

interface CosmicSystemRendererProps {
  system: HomeSystem;
  ships: Ship[];
  expeditions: Expedition[];
  onPlanetClick: (planet: Planet) => void;
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

const ORBIT_BASE = 90; // px from center for the innermost orbit
const ORBIT_STEP = 70; // px between orbits
const MIN_SCALE = 0.3;
const MAX_SCALE = 4;

/**
 * Deterministic pseudo-random angle per planet so the orbit position is
 * stable across renders but spreads planets around the star instead of
 * placing them all on one diagonal.
 */
function planetAngle(planet: Planet, index: number, systemSeed: number): number {
  const seed = (systemSeed | 0) + index * 1009 + (planet.id.charCodeAt(0) || 0);
  // Two-step LCG for variety.
  let s = seed;
  s = (s * 9301 + 49297) % 233280;
  return ((s / 233280) * Math.PI * 2) + (index % 2 === 0 ? 0 : Math.PI / 6);
}

export function CosmicSystemRenderer({
  system,
  ships,
  expeditions,
  onPlanetClick,
}: CosmicSystemRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // ----- Layout ----------------------------------------------------------

  const layouts = useMemo<PlanetLayout[]>(() => {
    const seed = Number(system.seed) || 1;
    return (system.planets ?? []).map((planet, index) => {
      const orbitRadius = ORBIT_BASE + index * ORBIT_STEP;
      const angle = planetAngle(planet, index, seed);
      const x = Math.cos(angle) * orbitRadius;
      const y = Math.sin(angle) * orbitRadius;
      // Bigger planets get a bigger sprite, but cap it so the map stays
      // readable at the default zoom.
      const sizeFromBiome = planet.biome === 'gas_giant' ? 70 : 52;
      const spriteSize = Math.round(sizeFromBiome * (0.85 + Math.min(0.6, (planet.size ?? 10) / 20)));
      return { planet, index, orbitRadius, angle, x, y, spriteSize };
    });
  }, [system]);

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return layouts.find((l) => l.planet.id === selectedId) ?? null;
  }, [layouts, selectedId]);

  // ----- Pan / pinch / wheel --------------------------------------------

  const dragState = useRef<{
    pointerId: number | null;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    pinchStartDist: number;
    pinchStartScale: number;
    pointers: Map<number, { x: number; y: number }>;
  }>({
    pointerId: null,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    pinchStartDist: 0,
    pinchStartScale: 1,
    pointers: new Map(),
  });

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = containerRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    dragState.current.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (dragState.current.pointers.size === 1) {
      dragState.current.pointerId = e.pointerId;
      dragState.current.startX = e.clientX;
      dragState.current.startY = e.clientY;
      dragState.current.originX = transform.x;
      dragState.current.originY = transform.y;
    } else if (dragState.current.pointers.size === 2) {
      const pts = Array.from(dragState.current.pointers.values());
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      dragState.current.pinchStartDist = Math.hypot(dx, dy);
      dragState.current.pinchStartScale = transform.scale;
    }
  }, [transform]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current.pointers.has(e.pointerId)) return;
    dragState.current.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (dragState.current.pointers.size === 2) {
      const pts = Array.from(dragState.current.pointers.values());
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      const dist = Math.hypot(dx, dy) || 1;
      const ratio = dist / Math.max(1, dragState.current.pinchStartDist);
      const newScale = Math.max(
        MIN_SCALE,
        Math.min(MAX_SCALE, dragState.current.pinchStartScale * ratio)
      );
      setTransform((t) => ({ ...t, scale: newScale }));
    } else if (e.pointerId === dragState.current.pointerId) {
      const dx = e.clientX - dragState.current.startX;
      const dy = e.clientY - dragState.current.startY;
      setTransform((t) => ({
        ...t,
        x: dragState.current.originX + dx,
        y: dragState.current.originY + dy,
      }));
    }
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragState.current.pointers.delete(e.pointerId);
    if (dragState.current.pointers.size === 0) {
      dragState.current.pointerId = null;
    }
  }, []);

  const onWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0015);
    setTransform((t) => {
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, t.scale * factor));
      // Zoom around the cursor so the point under the pointer stays put.
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { ...t, scale: newScale };
      const cx = e.clientX - rect.left - rect.width / 2;
      const cy = e.clientY - rect.top - rect.height / 2;
      const ratio = newScale / t.scale;
      return {
        scale: newScale,
        x: cx - (cx - t.x) * ratio,
        y: cy - (cy - t.y) * ratio,
      };
    });
  }, []);

  // Wheel needs to be passive: false to call preventDefault — React's onWheel
  // is attached as passive by default in modern React versions, so attach the
  // listener directly.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const factor = Math.exp(-e.deltaY * 0.0015);
      setTransform((t) => {
        const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, t.scale * factor));
        const rect = el.getBoundingClientRect();
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

  // ----- Render ----------------------------------------------------------

  return (
    <div
      ref={containerRef}
      className="cosmic-systemmap"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        touchAction: 'none',
        cursor: dragState.current.pointers.size > 0 ? 'grabbing' : 'grab',
        background: 'radial-gradient(ellipse at 50% 50%, rgba(91,215,255,0.06), transparent 60%), #050811',
      }}
    >
      {/* The "world" — centered at the container midpoint, transformed by
          pan/zoom state. Children are positioned in world coordinates with
          origin at (0,0) = center of the star. */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          transformOrigin: '0 0',
          willChange: 'transform',
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
              pointerEvents: 'none',
            }}
          />
        ))}

        {/* Sun in the middle */}
        <div
          style={{
            position: 'absolute',
            left: -56,
            top: -56,
            width: 112,
            height: 112,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <SunSvg size={112} />
        </div>

        {/* Planets */}
        {layouts.map((l) => {
          const biome = resolveBiome(l.planet.biome);
          const meta = BIOME_META[biome];
          const isSelected = l.planet.id === selectedId;
          return (
            <button
              key={l.planet.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (selectedId === l.planet.id) {
                  onPlanetClick(l.planet);
                } else {
                  setSelectedId(l.planet.id);
                }
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
                cursor: 'pointer',
                filter: isSelected ? `drop-shadow(0 0 8px ${meta.accent})` : 'drop-shadow(0 6px 14px rgba(0,0,0,0.5))',
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

        {/* Ship markers — tucked just outside their parking orbit */}
        {ships.map((ship, shipIdx) => {
          if (ship.status !== 'idle' || !ship.locationPlanetId) return null;
          const layout = layouts.find((l) => l.planet.id === ship.locationPlanetId);
          if (!layout) return null;
          const orbitOffset = 22;
          const r = layout.orbitRadius + orbitOffset;
          const a = layout.angle + 0.18 + shipIdx * 0.06;
          const sx = Math.cos(a) * r;
          const sy = Math.sin(a) * r;
          return (
            <div
              key={ship.id}
              style={{
                position: 'absolute',
                left: sx - 6,
                top: sy - 6,
                width: 12,
                height: 12,
                color: '#5BFFA9',
                pointerEvents: 'none',
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                <polygon points="0,0 12,6 0,12 3,6" />
              </svg>
            </div>
          );
        })}

        {/* Expedition trails — dashed line from origin planet toward the
            target sector direction. Length is fixed since we don't know the
            galactic distance scale here. */}
        {expeditions.map((exp) => {
          const origin = layouts.find((l) => l.planet.id === exp.originPlanetId);
          if (!origin) return null;
          const targetAngle = Math.atan2(Number(exp.targetY ?? 0), Number(exp.targetX ?? 1));
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

      {/* Legend (fixed bottom-left) */}
      <div
        style={{
          position: 'absolute',
          left: 12,
          bottom: 12,
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
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#5BFFA9', boxShadow: '0 0 6px #5BFFA9' }} />
          Idle ship
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 7, height: 2, background: '#F4B84A' }} />
          Expedition trail
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 7, height: 7, border: '1px dashed rgba(150,175,220,0.4)', borderRadius: '50%' }} />
          Orbit
        </div>
      </div>

      {/* Reset zoom (fixed top-right) */}
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
        }}
      >
        RESET · {transform.scale.toFixed(2)}×
      </button>

      {/* Selected planet info card (bottom center) */}
      {selected && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 100,
            transform: 'translateX(-50%)',
            width: 'calc(100% - 32px)',
            maxWidth: 360,
            padding: '12px 14px',
            border: '1px solid var(--line-strong)',
            borderRadius: 12,
            background: 'rgba(14,20,36,0.92)',
            backdropFilter: 'blur(10px)',
            color: 'var(--text)',
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
            onClick={() => onPlanetClick(selected.planet)}
            className="cosmic-cta"
            style={{ width: '100%', marginTop: 10, padding: '10px 14px' }}
          >
            Open planet
          </button>
        </div>
      )}
    </div>
  );
}
