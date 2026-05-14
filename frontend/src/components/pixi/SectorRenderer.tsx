import { useEffect, useRef } from 'react';
import * as PIXI from 'pixi.js';
import type {
  PresenceEntityRelation,
  PresenceEntityType,
  SectorPresenceEntity,
} from '@shared/types/multiplayer';
import { isUnknownSectorEntity, sectorEntityKey } from '../../lib/sectorMap';

const RELATION_COLORS: Record<
  PresenceEntityRelation,
  { fill: number; stroke: number; label: number; halo: number }
> = {
  self: { fill: 0x22d3ee, stroke: 0x7dd3fc, label: 0xdff7ff, halo: 0x155e75 },
  public: { fill: 0x64748b, stroke: 0x94a3b8, label: 0xcbd5e1, halo: 0x334155 },
  foreign: { fill: 0xf97316, stroke: 0xfbbf24, label: 0xffedd5, halo: 0x7c2d12 },
};

const ENTITY_TYPE_COLORS: Partial<
  Record<PresenceEntityType, { fill: number; stroke: number; halo: number }>
> = {
  home: { fill: 0x22d3ee, stroke: 0xa5f3fc, halo: 0x155e75 },
  colony: { fill: 0x34d399, stroke: 0x86efac, halo: 0x14532d },
  fleet: { fill: 0x60a5fa, stroke: 0xbfdbfe, halo: 0x1d4ed8 },
};

const FOREIGN_TYPE_COLORS: Partial<
  Record<PresenceEntityType, { fill: number; stroke: number; halo: number }>
> = {
  colony: { fill: 0xf97316, stroke: 0xfbbf24, halo: 0x7c2d12 },
  fleet: { fill: 0xe879f9, stroke: 0xf0abfc, halo: 0x86198f },
};

interface SectorRendererProps {
  entities: SectorPresenceEntity[];
  emptyLabel: string;
  selectedEntityId?: string | null;
  onEntitySelect?: (entity: SectorPresenceEntity) => void;
  getEntityLabel?: (entity: SectorPresenceEntity) => string;
}

/**
 * Pixi sector radar for multiplayer markers.
 * Uses relation color, entity shape, and summary redaction markers so local,
 * neutral, and foreign contacts remain distinct even when they share a system.
 */
export function SectorRenderer({
  entities,
  emptyLabel,
  selectedEntityId,
  onEntitySelect,
  getEntityLabel,
}: SectorRendererProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    let resizeFrame = 0;
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

      const scheduleRender = () => {
        window.cancelAnimationFrame(resizeFrame);
        resizeFrame = window.requestAnimationFrame(() => renderScene(app));
      };

      resizeObserver = new ResizeObserver(scheduleRender);
      resizeObserver.observe(el);
      renderScene(app);
    };

    void run();

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      window.cancelAnimationFrame(resizeFrame);
      app.destroy(true);
      appRef.current = null;
    };
  }, [emptyLabel, entities, getEntityLabel, onEntitySelect, selectedEntityId]);

  const renderScene = (app: PIXI.Application) => {
    for (const child of app.stage.removeChildren()) {
      child.destroy({ children: true });
    }

    const width = app.screen.width;
    const height = app.screen.height;
    drawBackground(app.stage, width, height);

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
      msg.x = width / 2;
      msg.y = height / 2;
      app.stage.addChild(msg);
      return;
    }

    const bounds = sectorBounds(entities);
    const positionTotals = countPositions(entities);
    const positionSeen = new Map<string, number>();
    const markerLayer = new PIXI.Container();
    const labelLayer = new PIXI.Container();
    app.stage.addChild(markerLayer);
    app.stage.addChild(labelLayer);

    for (const entity of entities) {
      const key = sectorEntityKey(entity);
      const base = projectEntity(entity, bounds, width, height);
      const positionKey = worldPositionKey(entity);
      const totalAtPosition = positionTotals.get(positionKey) ?? 1;
      const indexAtPosition = positionSeen.get(positionKey) ?? 0;
      positionSeen.set(positionKey, indexAtPosition + 1);

      const spread = totalAtPosition > 1 ? Math.min(34, 12 + totalAtPosition * 3) : 0;
      const angle = (Math.PI * 2 * indexAtPosition) / totalAtPosition - Math.PI / 2;
      const x = clamp(base.x + Math.cos(angle) * spread, 24, width - 24);
      const y = clamp(base.y + Math.sin(angle) * spread, 32, height - 32);
      const selected = key === selectedEntityId;

      const marker = drawMarker(entity, selected);
      marker.x = x;
      marker.y = y;
      if (onEntitySelect) {
        marker.eventMode = 'static';
        marker.cursor = 'pointer';
        marker.on('pointertap', () => onEntitySelect(entity));
      }
      markerLayer.addChild(marker);

      if (selected || entity.relation !== 'foreign') {
        const label = new PIXI.Text({
          text: getEntityLabel?.(entity) ?? entity.title,
          style: {
            fill: selected ? 0xffffff : markerLabelColor(entity),
            fontSize: selected ? 12 : 10,
            fontFamily: 'system-ui, sans-serif',
            fontWeight: selected ? '700' : '500',
            align: 'center',
            wordWrap: true,
            wordWrapWidth: 128,
          },
        });
        label.anchor.set(0.5, 1);
        label.x = x;
        label.y = y - 16;
        labelLayer.addChild(label);
      }
    }
  };

  return <div ref={wrapRef} className="sector-renderer" />;
}

function drawBackground(stage: PIXI.Container, width: number, height: number) {
  const bg = new PIXI.Graphics().rect(0, 0, width, height).fill({ color: 0x07101d });
  stage.addChild(bg);

  const stars = new PIXI.Graphics();
  for (let i = 0; i < 72; i += 1) {
    const x = pseudoRandom(i, 3) * width;
    const y = pseudoRandom(i, 17) * height;
    const radius = i % 9 === 0 ? 1.2 : 0.7;
    stars.circle(x, y, radius).fill({ color: 0xcbd5e1, alpha: i % 9 === 0 ? 0.38 : 0.18 });
  }
  stage.addChild(stars);

  const grid = new PIXI.Graphics();
  const step = 64;
  for (let x = 0; x <= width; x += step) {
    grid.moveTo(x, 0).lineTo(x, height);
  }
  for (let y = 0; y <= height; y += step) {
    grid.moveTo(0, y).lineTo(width, y);
  }
  grid.stroke({ width: 1, color: 0x1e293b, alpha: 0.42 });
  stage.addChild(grid);

  const rings = new PIXI.Graphics();
  const centerX = width / 2;
  const centerY = height / 2;
  const maxRadius = Math.min(width, height) * 0.42;
  for (const factor of [0.32, 0.58, 0.84]) {
    rings.circle(centerX, centerY, maxRadius * factor).stroke({
      width: 1,
      color: 0x2dd4bf,
      alpha: 0.12,
    });
  }
  rings
    .moveTo(centerX, 18)
    .lineTo(centerX, height - 18)
    .moveTo(18, centerY)
    .lineTo(width - 18, centerY)
    .stroke({ width: 1, color: 0x38bdf8, alpha: 0.18 });
  stage.addChild(rings);
}

function pseudoRandom(index: number, salt: number): number {
  const raw = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return raw - Math.floor(raw);
}

function sectorBounds(entities: SectorPresenceEntity[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const entity of entities) {
    minX = Math.min(minX, entity.worldPosition.x);
    maxX = Math.max(maxX, entity.worldPosition.x);
    minY = Math.min(minY, entity.worldPosition.y);
    maxY = Math.max(maxY, entity.worldPosition.y);
  }

  return {
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    spanX: Math.max(maxX - minX, 1),
    spanY: Math.max(maxY - minY, 1),
  };
}

function projectEntity(
  entity: SectorPresenceEntity,
  bounds: ReturnType<typeof sectorBounds>,
  width: number,
  height: number,
) {
  const pad = Math.max(42, Math.min(width, height) * 0.14);
  const scale = Math.min((width - pad * 2) / bounds.spanX, (height - pad * 2) / bounds.spanY);
  return {
    x: width / 2 + (entity.worldPosition.x - bounds.centerX) * scale,
    y: height / 2 + (entity.worldPosition.y - bounds.centerY) * scale,
  };
}

function drawMarker(entity: SectorPresenceEntity, selected: boolean): PIXI.Container {
  const container = new PIXI.Container();
  const palette = markerPalette(entity);
  const radius = entity.visibility === 'full' ? 8 : 7;

  const hit = new PIXI.Graphics().circle(0, 0, 24).fill({ color: 0xffffff, alpha: 0.001 });
  container.addChild(hit);

  if (selected) {
    const selectedRing = new PIXI.Graphics()
      .circle(0, 0, radius + 11)
      .stroke({ width: 2, color: 0xffffff, alpha: 0.88 })
      .circle(0, 0, radius + 17)
      .stroke({ width: 1, color: palette.stroke, alpha: 0.38 });
    container.addChild(selectedRing);
  }

  const halo = new PIXI.Graphics()
    .circle(0, 0, radius + 8)
    .fill({ color: palette.halo, alpha: entity.visibility === 'full' ? 0.34 : 0.22 });
  container.addChild(halo);

  const shape = new PIXI.Graphics();
  if (entity.entityType === 'fleet') {
    shape
      .circle(0, 0, radius + 5)
      .fill({ color: palette.halo, alpha: entity.visibility === 'full' ? 0.22 : 0.12 })
      .moveTo(-radius - 6, radius + 4)
      .lineTo(-2, -radius - 6)
      .quadraticCurveTo(0, -radius - 9, 2, -radius - 6)
      .lineTo(radius + 6, radius + 4)
      .lineTo(4, radius + 1)
      .lineTo(0, radius + 8)
      .lineTo(-4, radius + 1)
      .lineTo(-radius - 6, radius + 4)
      .fill({ color: palette.fill, alpha: entity.visibility === 'full' ? 0.95 : 0.56 })
      .stroke({ width: selected ? 2 : 1.2, color: palette.stroke, alpha: 0.98 });
  } else if (entity.entityType === 'colony') {
    shape
      .poly([0, -radius - 3, radius + 3, 0, 0, radius + 3, -radius - 3, 0])
      .fill({ color: palette.fill, alpha: entity.visibility === 'full' ? 0.95 : 0.52 })
      .stroke({ width: selected ? 2 : 1.2, color: palette.stroke, alpha: 0.98 });
  } else if (entity.entityType === 'home') {
    shape
      .circle(0, 0, radius + 1)
      .fill({ color: palette.fill, alpha: 0.98 })
      .stroke({ width: selected ? 2 : 1.2, color: palette.stroke, alpha: 0.98 });
  } else {
    shape
      .rect(-radius, -radius, radius * 2, radius * 2)
      .fill({ color: palette.fill, alpha: 0.28 })
      .stroke({ width: selected ? 2 : 1.2, color: palette.stroke, alpha: 0.8 });
  }
  container.addChild(shape);

  if (entity.entityType === 'home') {
    const cross = new PIXI.Graphics()
      .moveTo(-radius - 5, 0)
      .lineTo(radius + 5, 0)
      .moveTo(0, -radius - 5)
      .lineTo(0, radius + 5)
      .stroke({ width: 1.2, color: 0xe0f2fe, alpha: 0.92 });
    container.addChild(cross);
  }

  if (isUnknownSectorEntity(entity)) {
    const unknown = new PIXI.Text({
      text: '?',
      style: {
        fill: 0xfffbeb,
        fontSize: 10,
        fontFamily: 'system-ui, sans-serif',
        fontWeight: '700',
      },
    });
    unknown.anchor.set(0.5);
    container.addChild(unknown);
  }

  return container;
}

function markerPalette(entity: SectorPresenceEntity) {
  if (entity.relation === 'foreign') {
    return FOREIGN_TYPE_COLORS[entity.entityType] ?? RELATION_COLORS.foreign;
  }
  if (entity.relation === 'self') {
    return ENTITY_TYPE_COLORS[entity.entityType] ?? RELATION_COLORS.self;
  }
  return RELATION_COLORS.public;
}

function markerLabelColor(entity: SectorPresenceEntity): number {
  if (entity.relation === 'foreign') return RELATION_COLORS.foreign.label;
  if (entity.relation === 'self') return RELATION_COLORS.self.label;
  return RELATION_COLORS.public.label;
}

function worldPositionKey(entity: SectorPresenceEntity): string {
  return `${entity.worldPosition.x}:${entity.worldPosition.y}:${entity.worldPosition.z}`;
}

function countPositions(entities: SectorPresenceEntity[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entity of entities) {
    const key = worldPositionKey(entity);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
