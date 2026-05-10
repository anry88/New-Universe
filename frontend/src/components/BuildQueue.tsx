import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../lib/api';
import { resolveBuildingType } from './cosmic/buildings';
import { QueueStrip } from './cosmic/atoms';
import { useQueryClient } from '@tanstack/react-query';

interface BuildQueueItem {
  id: string;
  planetId: string;
  buildingTypeId: string;
  level: number;
  queueAction: 'build' | 'upgrade' | 'destroy';
  queueCompletesAt: string;
  queueStartedAt?: string;
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
  const [now, setNow] = useState(Date.now());
  const queryClient = useQueryClient();
  const syncingRef = useRef<string | null>(null);

  const fetchQueue = async () => {
    try {
      const data = await apiFetch<{ queue: BuildQueueItem[] }>('/buildings/queue');
      setQueue(data.queue || []);
    } catch {
      setQueue([]);
    }
  };

  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      const currentNow = Date.now();
      setNow(currentNow);

      if (queue.length > 0) {
        const head = queue[0];
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
  }, [queue, queryClient]);

  const filteredQueue = planetId ? queue.filter((item) => item.planetId === planetId) : queue;

  if (!filteredQueue.length) return null;
  const head = filteredQueue[0];
  const completesAt = new Date(head.queueCompletesAt).getTime();
  const startedAt = head.queueStartedAt
    ? new Date(head.queueStartedAt).getTime()
    : completesAt - 60_000; // best-effort fallback if backend omits start
  const total = Math.max(1, completesAt - startedAt);
  const remaining = Math.max(0, completesAt - now);
  const progress = Math.min(100, Math.max(0, Math.round((1 - remaining / total) * 100)));
  const remainingSec = Math.ceil(remaining / 1000);

  const def = resolveBuildingType(head.buildingTypeId);
  const verb = head.queueAction === 'build' ? 'Building' : 'Upgrading';
  const title = `${def.label} · ${verb} L${head.level}`;

  return <QueueStrip title={title} etaSec={remainingSec} progressPct={progress} />;
}
