import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { apiFetch } from '../lib/api';
import { getBuildingLabel } from './cosmic/buildings';
import { QueueStrip } from './cosmic/atoms';
import { useQueryClient } from '@tanstack/react-query';
import { useMe } from '../hooks/useMe';
import type { BuildingQueueItem, RushBuildResponse } from '@shared/types/buildings';
import { estimateRushDiamondCost } from '@shared/types/diamonds';
import { timerSnapshot } from '../lib/timers';
import { useI18n } from '../lib/i18n';

interface BuildQueueProps {
  planetId?: string;
}

/**
 * Bottom strip showing the next item in the build queue. The strip auto-hides
 * when the queue is empty so the bottom navigation can sit flush against the
 * scroll area. It derives rows from `/me` so optimistic construction updates
 * appear immediately, then server sync replaces exact ids/timestamps.
 *
 * Stylistically it matches the Cosmic Atlas QueueStrip: a single rounded card
 * with a clock icon, title, progress bar and live ETA. Multiple queue items
 * are not stacked here — only the head is rendered, which mirrors the design
 * intent (one focal task at a time).
 */
export function BuildQueue({ planetId }: BuildQueueProps) {
  const [now, setNow] = useState(Date.now());
  const [rushBusy, setRushBusy] = useState(false);
  const queryClient = useQueryClient();
  const syncingRef = useRef<string | null>(null);
  const { data: meData } = useMe();
  const { locale, t } = useI18n();

  const queue = useMemo<BuildingQueueItem[]>(() => {
    const rows: BuildingQueueItem[] = [];
    for (const planet of meData?.planets ?? []) {
      for (const building of planet.buildings ?? []) {
        if (!building.queueAction || !building.queueCompletesAt) continue;
        rows.push({
          id: building.id,
          planetId: planet.id,
          buildingTypeId: building.typeId,
          level: building.level,
          queueAction: building.queueAction,
          queueCompletesAt: building.queueCompletesAt,
          queueStartedAt: building.queueStartedAt ?? null,
          selectedResourceId: building.selectedResourceId ?? null,
          slotIndex: building.slotIndex,
        });
      }
    }
    return rows.sort(
      (a, b) =>
        new Date(a.queueCompletesAt).getTime() -
        new Date(b.queueCompletesAt).getTime(),
    );
  }, [meData?.planets]);

  const onRush = useCallback(async () => {
    const filtered = planetId ? queue.filter((item) => item.planetId === planetId) : queue;
    const head = filtered[0];
    if (!head || rushBusy || head.id.startsWith('temp-')) return;
    setRushBusy(true);
    try {
      await apiFetch<RushBuildResponse>('/buildings/rush', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buildingId: head.id }),
      });
      queryClient.invalidateQueries({ queryKey: ['me'] });
    } catch {
      /* surface via disabled state / cost refresh */
    } finally {
      setRushBusy(false);
    }
  }, [planetId, queue, queryClient, rushBusy]);

  useEffect(() => {
    const timer = setInterval(() => {
      const currentNow = Date.now();
      setNow(currentNow);

      const filtered = planetId ? queue.filter((item) => item.planetId === planetId) : queue;
      if (filtered.length > 0) {
        const head = filtered[0];
        const completesAt = new Date(head.queueCompletesAt).getTime();
        if (currentNow >= completesAt && syncingRef.current !== head.id) {
          syncingRef.current = head.id;
          apiFetch(`/buildings/sync/${head.planetId}`, { method: 'POST' })
            .then(() => {
              queryClient.invalidateQueries({ queryKey: ['me'] });
            })
            .finally(() => {
              syncingRef.current = null;
            });
        }
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [queue, queryClient, planetId]);

  const filteredQueue = planetId ? queue.filter((item) => item.planetId === planetId) : queue;

  if (!filteredQueue.length) return null;
  const head = filteredQueue[0];
  const snapshot = timerSnapshot({
    completesAt: head.queueCompletesAt,
    startedAt: head.queueStartedAt,
    nowMs: now,
  });

  const verb = head.queueAction === 'build' ? t('build.queueBuilding') : t('build.queueUpgrading');
  const title = `${getBuildingLabel(head.buildingTypeId, locale)} · ${verb} L${head.level}`;
  const rushPricing = meData?.rushPricing ?? null;

  const rushCost =
    rushPricing != null
      ? estimateRushDiamondCost(
          snapshot.remainingSec,
          rushPricing.diamondsPerMinute,
          rushPricing.maxPerAction,
        )
      : head.rushCost ?? 0;
  const diamondBalance = meData?.diamonds ?? 0;
  const waitingForServerId = head.id.startsWith('temp-');

  return (
    <QueueStrip
      title={title}
      etaSec={snapshot.remainingSec}
      progressPct={snapshot.progressPct}
      rushCost={rushCost}
      diamondBalance={diamondBalance}
      rushBusy={rushBusy}
      rushDisabled={waitingForServerId}
      onRush={onRush}
    />
  );
}
