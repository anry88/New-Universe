import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';
import { resolveBuildingType } from './cosmic/buildings';
import { QueueStrip } from './cosmic/atoms';

interface BuildQueueItem {
  id: string;
  buildingTypeId: string;
  level: number;
  queueAction: 'build' | 'upgrade' | 'destroy';
  queueCompletesAt: string;
  queueStartedAt?: string;
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
export function BuildQueue() {
  const [queue, setQueue] = useState<BuildQueueItem[]>([]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const fetchQueue = async () => {
      try {
        const data = await apiFetch<{ queue: BuildQueueItem[] }>('/buildings/queue');
        setQueue(data.queue || []);
      } catch {
        setQueue([]);
      }
    };

    fetchQueue();
    const interval = setInterval(fetchQueue, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!queue.length) return null;
  const head = queue[0];
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
