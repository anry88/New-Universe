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

      // Planets
      system.planets?.forEach((planet, index) => {
        const orbitRadius = 120 + index * 80;
        
        // Orbit line
        const orbit = new PIXI.Graphics()
          .circle(0, 0, orbitRadius)
          .stroke({ width: 1, color: 0x334155, alpha: 0.5 });
        world.addChild(orbit);

        // Planet container for easier rotation
        const planetContainer = new PIXI.Container();
        const angle = (index * 1.5) + (system.seed % 10);
        planetContainer.x = Math.cos(angle) * orbitRadius;
        planetContainer.y = Math.sin(angle) * orbitRadius;
        world.addChild(planetContainer);

        const planetCircle = new PIXI.Graphics()
          .circle(0, 0, 15)
          .fill({ color: 0x3b82f6 });
        
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
        label.y = 20;
        planetContainer.addChild(label);
      });

      // Ships
      ships.forEach((ship, index) => {
        if (ship.status === 'idle' && ship.locationPlanetId) {
          // Find planet
          const planetIndex = system.planets?.findIndex(p => p.id === ship.locationPlanetId) ?? -1;
          if (planetIndex !== -1) {
             const orbitRadius = 120 + planetIndex * 80;
             const angle = (planetIndex * 1.5) + (system.seed % 10) + 0.2 + (index * 0.1);
             
             const shipMarker = new PIXI.Graphics()
               .poly([-5, -5, 10, 0, -5, 5])
               .fill({ color: 0x10b981 }); // emerald-500
             
             shipMarker.x = Math.cos(angle) * (orbitRadius + 25);
             shipMarker.y = Math.sin(angle) * (orbitRadius + 25);
             shipMarker.rotation = angle;
             world.addChild(shipMarker);
          }
        }
      });

      // Expeditions (Trajectories)
      expeditions.forEach(exp => {
        const originPlanet = system.planets?.find(p => p.id === exp.originPlanetId);
        if (originPlanet) {
          const pIdx = system.planets?.indexOf(originPlanet) ?? 0;
          const orbitRadius = 120 + pIdx * 80;
          const angle = (pIdx * 1.5) + (system.seed % 10);
          
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
      app.ticker.add((time) => {
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
