import React from 'react';
import type { Building } from '@shared/types/world';
import { BuildSlot } from './cosmic/atoms';

interface BuildingSlotProps {
  index: number;
  building?: Building;
  onClick: (index: number, building?: Building) => void;
  /** Biome accent so the icon picks up the active planet's color. */
  biomeAccent?: string;
}

const computeProgress = (building: Building) => {
  if (!building.queueAction || !building.queueCompletesAt) return undefined;
  const completesAt = new Date(building.queueCompletesAt).getTime();
  const now = Date.now();
  const remainingMs = Math.max(0, completesAt - now);
  return {
    etaSec: Math.ceil(remainingMs / 1000),
    // The backend doesn't expose queueStartedAt yet — show a best-effort
    // half-bar so the slot signals "in progress" without lying about
    // exact completion time.
    progressPct: 64,
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
