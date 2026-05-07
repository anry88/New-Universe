import { useState, useEffect } from 'react';
import { apiFetch } from '../lib/api';

interface BuildQueueItem {
  id: string;
  buildingTypeId: string;
  level: number;
  queueAction: 'build' | 'upgrade' | 'destroy';
  queueCompletesAt: string;
}

export function BuildQueue() {
  const [queue, setQueue] = useState<BuildQueueItem[]>([]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const fetchQueue = async () => {
      try {
        const data = await apiFetch<{ queue: BuildQueueItem[] }>('/buildings/queue');
        setQueue(data.queue || []);
      } catch {
        // Mock data for now
        setQueue([
          {
            id: '1',
            buildingTypeId: 'mine',
            level: 2,
            queueAction: 'upgrade',
            queueCompletesAt: new Date(Date.now() + 300000).toISOString(),
          },
        ]);
      }
    };
    fetchQueue();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!queue.length) return null;

  return (
    <div className="px-4 py-3 bg-slate-800/95 backdrop-blur-sm border-t border-slate-700">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
        Build Queue
      </h3>
      <div className="space-y-2">
        {queue.map(item => {
          const completesAt = new Date(item.queueCompletesAt).getTime();
          const remaining = Math.max(0, completesAt - now);
          const minutes = Math.floor(remaining / 60000);
          const seconds = Math.floor((remaining % 60000) / 1000);

          return (
            <div key={item.id} className="flex items-center gap-3 bg-slate-900/50 rounded-lg p-3">
              <span className="text-2xl">🏭</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {item.queueAction === 'build' ? 'Building' : 'Upgrading'} {item.buildingTypeId}
                </p>
                <p className="text-xs text-slate-400">
                  Level {item.level} • {minutes}m {seconds}s remaining
                </p>
              </div>
              <div className="w-12 h-12 rounded-full border-2 border-blue-500 flex items-center justify-center">
                <span className="text-xs text-blue-400 font-mono">
                  {minutes}:{seconds.toString().padStart(2, '0')}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
