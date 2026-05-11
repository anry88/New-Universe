import { useEffect, useRef } from 'react';
import * as PIXI from 'pixi.js';
import type { PresenceEntityKind, SectorPresenceEntity } from '@shared/types/multiplayer';

const KIND_COLORS: Record<PresenceEntityKind, number> = {
  neutral_system: 0x64748b,
  own_home_system: 0x22d3ee,
  own_colony: 0x34d399,
  foreign_colony: 0xf97316,
  own_ship: 0x60a5fa,
  foreign_ship: 0xe879f9,
};

interface SectorRendererProps {
  entities: SectorPresenceEntity[];
  emptyLabel: string;
}

/**
 * Lightweight Pixi scatter plot for sector-scale markers (multiplayer slice).
 * Maps world X/Y into view space while preserving relative distances within the sector.
 */
export function SectorRenderer({ entities, emptyLabel }: SectorRendererProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    let cancelled = false;
    const app = new PIXI.Application();

    const run = async () => {
      await app.init({
        resizeTo: el,
        backgroundColor: 0x0c1220,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });
      if (cancelled) {
        app.destroy(true);
        return;
      }
      el.appendChild(app.canvas);
      appRef.current = app;

      const layer = new PIXI.Container();
      app.stage.addChild(layer);
      layer.x = app.screen.width / 2;
      layer.y = app.screen.height / 2;

      const labelLayer = new PIXI.Container();
      app.stage.addChild(labelLayer);

      if (entities.length === 0) {
        const msg = new PIXI.Text({
          text: emptyLabel,
          style: {
            fill: 0x94a3b8,
            fontSize: 13,
            fontFamily: 'system-ui, sans-serif',
          },
        });
        msg.anchor.set(0.5);
        msg.x = app.screen.width / 2;
        msg.y = app.screen.height / 2;
        app.stage.addChild(msg);
        return;
      }

      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const e of entities) {
        const { x, y } = e.worldPosition;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }

      const pad = 40;
      const spanX = Math.max(maxX - minX, 1);
      const spanY = Math.max(maxY - minY, 1);
      const scale = Math.min((app.screen.width - pad * 2) / spanX, (app.screen.height - pad * 2) / spanY);

      for (const e of entities) {
        const fill = KIND_COLORS[e.kind] ?? 0xffffff;
        const r = e.visibility === 'full' ? 7 : 5;
        const g = new PIXI.Graphics().circle(0, 0, r).fill({ color: fill, alpha: 0.95 });
        const nx = (e.worldPosition.x - (minX + maxX) / 2) * scale;
        const ny = (e.worldPosition.y - (minY + maxY) / 2) * scale;
        g.x = nx;
        g.y = ny;
        layer.addChild(g);

        const t = new PIXI.Text({
          text: e.title + (e.subtitle ? `\n${e.subtitle}` : ''),
          style: {
            fill: 0xcbd5e1,
            fontSize: 10,
            fontFamily: 'system-ui, sans-serif',
            align: 'center',
          },
        });
        t.anchor.set(0.5, 1);
        t.x = nx;
        t.y = ny - 12;
        labelLayer.addChild(t);
      }

      layer.y += 8;
      labelLayer.y += 8;
    };

    void run();

    return () => {
      cancelled = true;
      app.destroy(true);
      appRef.current = null;
    };
  }, [emptyLabel, entities]);

  return <div ref={wrapRef} style={{ width: '100%', height: '100%', minHeight: 280 }} />;
}
