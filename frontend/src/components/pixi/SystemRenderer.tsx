import { useEffect, useRef } from 'react';
import * as PIXI from 'pixi.js';
import { HomeSystem, Planet } from '@shared/types/world';
import { Ship } from '@shared/types/ships';
import { Expedition } from '@shared/types/expeditions';

interface SystemRendererProps {
  system: HomeSystem;
  ships: Ship[];
  expeditions: Expedition[];
  onPlanetClick: (planet: Planet) => void;
}

/**
 * Biome → fill / glow palette. Mirrors the design bundle in
 * `design-bundle/project/New Universe - Planet System.html`. Keep in
 * lockstep with `backend/src/features/world/biomes.ts`.
 */
const BIOME_PALETTE: Record<
  string,
  { fill: number; glow: number; orbit: number }
> = {
  volcanic: { fill: 0xff5a2d, glow: 0xff8a4a, orbit: 0x6e2a1a },
  rocky: { fill: 0xa07a55, glow: 0xc99a72, orbit: 0x4a3a2a },
  green: { fill: 0x5bffa9, glow: 0x9affc8, orbit: 0x2a5a44 },
  ocean: { fill: 0x4aa3ff, glow: 0x9dd0ff, orbit: 0x244a72 },
  gas_giant: { fill: 0xf4b84a, glow: 0xffd58a, orbit: 0x6a4a1c },
  ice: { fill: 0xb6e0ff, glow: 0xe2f1ff, orbit: 0x2a3e58 },
  anomaly: { fill: 0xb866ff, glow: 0xe2b6ff, orbit: 0x4a2a6a },
  unknown: { fill: 0x3b82f6, glow: 0x7da6ff, orbit: 0x334155 },
};

/**
 * Biome → orbit tier. Inner biomes (volcanic) sit close to the star,
 * outer biomes (ice) live on the far edge. This is the visual
 * representation of `BIOME_ORBIT_TIER` on the backend.
 */
const BIOME_ORBIT_TIER: Record<string, number> = {
  volcanic: 1,
  rocky: 2,
  green: 3,
  ocean: 4,
  gas_giant: 5,
  ice: 6,
  anomaly: 7,
};

/**
 * Biome → display radius (in renderer pixels). Gas giants look giant,
 * rocky/volcanic worlds look small. The renderer also scales by the
 * planet's numeric `size` field so two planets of the same biome don't
 * end up identical.
 */
const BIOME_BASE_RADIUS: Record<string, number> = {
  volcanic: 11,
  rocky: 12,
  green: 16,
  ocean: 17,
  gas_giant: 26,
  ice: 19,
  anomaly: 15,
  unknown: 14,
};

const ORBIT_BASE = 120;
const ORBIT_STEP = 80;

function planetVisuals(planet: Planet) {
  const biome = (planet.biome as keyof typeof BIOME_PALETTE) || 'unknown';
  const palette = BIOME_PALETTE[biome] ?? BIOME_PALETTE.unknown;
  const baseRadius = BIOME_BASE_RADIUS[biome] ?? BIOME_BASE_RADIUS.unknown;
  // `size` is the backend's numeric size (≈ 6..42). Map it to a [0.8..1.2]
  // multiplier so visual area scales meaningfully with the biome's
  // expected range without two same-biome planets ever looking identical.
  const sizeNum = typeof planet.size === 'number' ? planet.size : 12;
  const scale = 0.8 + Math.min(0.4, sizeNum / 60);
  return {
    palette,
    radius: Math.round(baseRadius * scale),
    biome,
  };
}

/**
 * Returns planets in orbit-tier order so volcanic worlds render on the
 * inner orbit and ice worlds on the outer one. Stable within a tier by
 * id, matching the backend planet-id ordering.
 */
function planetsByOrbit(planets: Planet[]): Planet[] {
  return [...planets].sort((a, b) => {
    const aT = BIOME_ORBIT_TIER[a.biome ?? 'unknown'] ?? 99;
    const bT = BIOME_ORBIT_TIER[b.biome ?? 'unknown'] ?? 99;
    if (aT !== bT) return aT - bT;
    return (a.id ?? '').localeCompare(b.id ?? '');
  });
}

export function SystemRenderer({ system, ships, expeditions, onPlanetClick }: SystemRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const app = new PIXI.Application();
    
    const init = async () => {
      await app.init({
        resizeTo: containerRef.current!,
        backgroundColor: 0x0f172a, // slate-900
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });

      if (!containerRef.current) return;
      containerRef.current.appendChild(app.canvas);
      appRef.current = app;

      const world = new PIXI.Container();
      app.stage.addChild(world);

      world.x = app.screen.width / 2;
      world.y = app.screen.height / 2;

      // Interactivity
      let isDragging = false;
      let lastPos = { x: 0, y: 0 };

      const onPointerDown = (e: PointerEvent) => {
        isDragging = true;
        lastPos = { x: e.clientX, y: e.clientY };
      };

      const onPointerMove = (e: PointerEvent) => {
        if (!isDragging) return;
        const dx = e.clientX - lastPos.x;
        const dy = e.clientY - lastPos.y;
        world.x += dx;
        world.y += dy;
        lastPos = { x: e.clientX, y: e.clientY };
      };

      const onPointerUp = () => {
        isDragging = false;
      };

      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        const scaleAmount = -e.deltaY * 0.001;
        const newScale = Math.max(0.2, Math.min(5, world.scale.x + scaleAmount));
        
        // Zoom towards mouse
        const localPos = world.toLocal(new PIXI.Point(e.clientX, e.clientY));
        world.scale.set(newScale);
        const newGlobalPos = world.toGlobal(localPos);
        world.x -= (newGlobalPos.x - e.clientX);
        world.y -= (newGlobalPos.y - e.clientY);
      };

      app.canvas.addEventListener('pointerdown', onPointerDown);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      app.canvas.addEventListener('wheel', onWheel, { passive: false });

      // Star
      const star = new PIXI.Graphics()
        .circle(0, 0, 40)
        .fill({ color: 0xffd700, alpha: 1 })
        .circle(0, 0, 50)
        .fill({ color: 0xffd700, alpha: 0.2 });
      world.addChild(star);

      // Planets — sorted by biome orbit tier (inner → outer)
      const orderedPlanets = planetsByOrbit(system.planets ?? []);
      const planetLayout = new Map<
        string,
        { orbitRadius: number; angle: number }
      >();

      orderedPlanets.forEach((planet, index) => {
        const orbitRadius = ORBIT_BASE + index * ORBIT_STEP;
        const { palette, radius } = planetVisuals(planet);

        // Orbit line — tinted toward the biome so the system at a glance
        // shows hot vs cold rings.
        const orbit = new PIXI.Graphics()
          .circle(0, 0, orbitRadius)
          .stroke({ width: 1, color: palette.orbit, alpha: 0.55 });
        world.addChild(orbit);

        // Planet container for easier rotation
        const planetContainer = new PIXI.Container();
        const angle = (index * 1.5) + (system.seed % 10);
        planetContainer.x = Math.cos(angle) * orbitRadius;
        planetContainer.y = Math.sin(angle) * orbitRadius;
        world.addChild(planetContainer);
        planetLayout.set(planet.id, { orbitRadius, angle });

        // Soft halo
        const halo = new PIXI.Graphics()
          .circle(0, 0, radius + 6)
          .fill({ color: palette.glow, alpha: 0.18 });
        planetContainer.addChild(halo);

        const planetCircle = new PIXI.Graphics()
          .circle(0, 0, radius)
          .fill({ color: palette.fill });

        planetCircle.eventMode = 'static';
        planetCircle.cursor = 'pointer';
        planetCircle.on('pointertap', () => onPlanetClick(planet));
        planetContainer.addChild(planetCircle);

        const label = new PIXI.Text({
          text: planet.name || '?',
          style: {
            fontSize: 14,
            fill: 0xffffff,
            fontWeight: 'bold',
          }
        });
        label.anchor.set(0.5, 0);
        label.y = radius + 6;
        planetContainer.addChild(label);
      });

      // Ships
      ships.forEach((ship, index) => {
        if (ship.status === 'idle' && ship.locationPlanetId) {
          const layout = planetLayout.get(ship.locationPlanetId);
          if (layout) {
             const angle = layout.angle + 0.2 + (index * 0.1);

             const shipMarker = new PIXI.Graphics()
               .poly([-5, -5, 10, 0, -5, 5])
               .fill({ color: 0x10b981 }); // emerald-500

             shipMarker.x = Math.cos(angle) * (layout.orbitRadius + 25);
             shipMarker.y = Math.sin(angle) * (layout.orbitRadius + 25);
             shipMarker.rotation = angle;
             world.addChild(shipMarker);
          }
        }
      });

      // Expeditions (Trajectories)
      expeditions.forEach(exp => {
        const originPlanet = (system.planets ?? []).find(p => p.id === exp.originPlanetId);
        if (originPlanet) {
          const layout = planetLayout.get(originPlanet.id);
          const orbitRadius = layout?.orbitRadius ?? ORBIT_BASE;
          const angle = layout?.angle ?? 0;
          
          const startX = Math.cos(angle) * orbitRadius;
          const startY = Math.sin(angle) * orbitRadius;
          
          // Destination (if in same system, but usually expeditions go to sectors)
          // For now, let's draw a line towards the target sector
          const targetAngle = Math.atan2(exp.targetY, exp.targetX);
          const endX = Math.cos(targetAngle) * 1000;
          const endY = Math.sin(targetAngle) * 1000;

          const trajectory = new PIXI.Graphics()
            .moveTo(startX, startY)
            .lineTo(endX, endY)
            .stroke({ width: 1, color: 0xf59e0b, alpha: 0.3 }); // amber-500
          world.addChild(trajectory);
        }
      });

      // Animation loop for small rotations
      app.ticker.add((_time) => {
        // Star pulse
        star.scale.set(1 + Math.sin(Date.now() / 1000) * 0.05);
      });
    };

    init();

    return () => {
      if (appRef.current) {
        appRef.current.destroy(true, { children: true });
        appRef.current = null;
      }
    };
  }, [system, ships, expeditions, onPlanetClick]);

  return <div ref={containerRef} className="w-full h-full touch-none" />;
}
