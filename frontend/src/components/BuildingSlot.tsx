import React from 'react';
import type { Building } from '@shared/types/world';
import { BuildSlot } from './cosmic/atoms';
import { timerSnapshot } from '../lib/timers';

interface BuildingSlotProps {
  index: number;
  building?: Building;
  onClick: (index: number, building?: Building) => void;
  /** Biome accent so the icon picks up the active planet's color. */
  biomeAccent?: string;
}

const computeProgress = (building: Building) => {
  if (!building.queueAction || !building.queueCompletesAt) return undefined;
  const snapshot = timerSnapshot({
    completesAt: building.queueCompletesAt,
    startedAt: building.queueStartedAt,
  });
  return {
    etaSec: snapshot.remainingSec,
    progressPct: snapshot.progressPct,
  };
};

/**
 * Cosmic Atlas styled building slot. Wraps the shared atom so existing pages
 * keep working without knowing about the new design system internals.
 */
export const BuildingSlot: React.FC<BuildingSlotProps> = ({
  index,
  building,
  onClick,
  biomeAccent = '#5BD7FF',
}) => {
  const hasQueue = Boolean(building?.queueAction && building.queueCompletesAt);
  const [, setNow] = React.useState(Date.now());

  React.useEffect(() => {
    if (!hasQueue) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [hasQueue]);

  const progress = building ? computeProgress(building) : undefined;
  return (
    <BuildSlot
      slot={{
        idx: index,
        typeId: building?.typeId ?? null,
        level: building?.level,
        building: Boolean(building?.queueAction),
        etaSec: progress?.etaSec,
        progressPct: progress?.progressPct,
      }}
      biomeAccent={biomeAccent}
      onClick={() => onClick(index, building)}
    />
  );
};
