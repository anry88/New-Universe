import { useState, useEffect, useRef, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import { resolveBuildingType } from './cosmic/buildings';
import { QueueStrip } from './cosmic/atoms';
import { useQueryClient } from '@tanstack/react-query';
import { useMe } from '../hooks/useMe';
import type { RushBuildResponse } from '@shared/types/buildings';
import { estimateRushDiamondCost } from '@shared/types/diamonds';
import { timerSnapshot } from '../lib/timers';

interface BuildQueueItem {
  id: string;
  planetId: string;
  buildingTypeId: string;
  level: number;
  queueAction: 'build' | 'upgrade' | 'destroy';
  queueCompletesAt: string;
  queueStartedAt?: string | null;
  /** Server snapshot; live price uses `estimateRushDiamondCost` + `rushPricing` from the same response. */
  rushCost?: number;
}

interface BuildQueueProps {
  planetId?: string;
}

/**
 * Bottom strip showing the next item in the build queue. The strip auto-hides
 * when the queue is empty so the bottom navigation can sit flush against the
 * scroll area.
 *
 * Stylistically it matches the Cosmic Atlas QueueStrip: a single rounded card
 * with a clock icon, title, progress bar and live ETA. Multiple queue items
 * are not stacked here — only the head is rendered, which mirrors the design
 * intent (one focal task at a time).
 */
export function BuildQueue({ planetId }: BuildQueueProps) {
  const [queue, setQueue] = useState<BuildQueueItem[]>([]);
  const [rushPricing, setRushPricing] = useState<{
    diamondsPerMinute: number;
    maxPerAction: number | null;
  } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [rushBusy, setRushBusy] = useState(false);
  const queryClient = useQueryClient();
  const syncingRef = useRef<string | null>(null);
  const { data: meData } = useMe();

  const fetchQueue = async () => {
    try {
      const data = await apiFetch<{
        queue: BuildQueueItem[];
        rushPricing?: { diamondsPerMinute: number; maxPerAction: number | null };
      }>('/buildings/queue');
      setQueue(data.queue || []);
      setRushPricing(data.rushPricing ?? null);
    } catch {
      setQueue([]);
      setRushPricing(null);
    }
  };

  const onRush = useCallback(async () => {
    const filtered = planetId ? queue.filter((item) => item.planetId === planetId) : queue;
    const head = filtered[0];
    if (!head || rushBusy) return;
    setRushBusy(true);
    try {
      await apiFetch<RushBuildResponse>('/buildings/rush', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buildingId: head.id }),
      });
      queryClient.invalidateQueries({ queryKey: ['me'] });
      await fetchQueue();
    } catch {
      /* surface via disabled state / cost refresh */
    } finally {
      setRushBusy(false);
    }
  }, [planetId, queue, queryClient, rushBusy]);

  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 15000);
    return () => clearInterval(interval);
  }, []);

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
              return fetchQueue();
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

  const def = resolveBuildingType(head.buildingTypeId);
  const verb = head.queueAction === 'build' ? 'Building' : 'Upgrading';
  const title = `${def.label} · ${verb} L${head.level}`;

  const rushCost =
    rushPricing != null
      ? estimateRushDiamondCost(
          snapshot.remainingSec,
          rushPricing.diamondsPerMinute,
          rushPricing.maxPerAction,
        )
      : head.rushCost ?? 0;
  const diamondBalance = meData?.diamonds ?? 0;

  return (
    <QueueStrip
      title={title}
      etaSec={snapshot.remainingSec}
      progressPct={snapshot.progressPct}
      rushCost={rushCost}
      diamondBalance={diamondBalance}
      rushBusy={rushBusy}
      onRush={onRush}
    />
  );
}
