import React from 'react';
import type { Locale } from '@shared/types/locale';
import type { Building } from '@shared/types/world';
import { BuildSlot } from './cosmic/atoms';
import { timerSnapshot } from '../lib/timers';
import { ResourceAmountList } from './cosmic/resources';
import { useI18n } from '../lib/i18n';

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

const formatProcessOutput = (building: Building, locale: Locale): React.ReactElement | undefined => {
  const activeOrders = (building.production?.activeOrders ?? []).filter((order) =>
    order.status === 'queued' || order.status === 'paused',
  );
  const order = activeOrders[0];
  if (!order) return undefined;
  return (
    <ResourceAmountList
      items={order.outputs.map((output) => ({
        resourceId: output.resourceId,
        amount: output.amount.toLocaleString(undefined, { maximumFractionDigits: 1 }),
      }))}
      prefix="+"
      iconSize={12}
      locale={locale}
    />
  );
};

const computeProcess = (building: Building, locale: Locale) => {
  const activeOrders = (building.production?.activeOrders ?? []).filter((order) =>
    order.status === 'queued' || order.status === 'paused',
  );
  const order = activeOrders[0];
  const outputLabel = formatProcessOutput(building, locale);
  if (!order || !outputLabel) return undefined;
  const pausedAtMs = order.status === 'paused' && order.pausedAt
    ? new Date(order.pausedAt).getTime()
    : undefined;
  const snapshot = timerSnapshot({
    completesAt: order.completesAt,
    startedAt: order.startedAt,
    nowMs: pausedAtMs,
  });
  return {
    outputLabel,
    etaSec: snapshot.remainingSec,
    progressPct: snapshot.progressPct,
    paused: order.status === 'paused',
    extraCount: Math.max(0, activeOrders.length - 1),
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
  const { locale } = useI18n();
  const hasQueue = Boolean(building?.queueAction && building.queueCompletesAt);
  const [, setNow] = React.useState(Date.now());

  React.useEffect(() => {
    if (!hasQueue) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [hasQueue]);

  const progress = building ? computeProgress(building) : undefined;
  const process = building ? computeProcess(building, locale) : undefined;
  return (
    <BuildSlot
      slot={{
        idx: index,
        typeId: building?.typeId ?? null,
        level: building?.level,
        building: Boolean(building?.queueAction),
        etaSec: progress?.etaSec,
        progressPct: progress?.progressPct,
        disabled: building?.energy?.disabled,
        energyStored: building?.energy?.stored,
        energyCapacity: building?.energy?.capacity,
        process,
      }}
      biomeAccent={biomeAccent}
      onClick={() => onClick(index, building)}
    />
  );
};
