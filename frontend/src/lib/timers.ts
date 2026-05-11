export interface TimerSnapshotInput {
  completesAt?: string | null;
  startedAt?: string | null;
  totalDurationSec?: number | null;
  nowMs?: number;
}

export interface TimerSnapshot {
  remainingMs: number;
  remainingSec: number;
  progressPct: number;
  isDue: boolean;
}

function parseTime(value?: string | null): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function timerSnapshot({
  completesAt,
  startedAt,
  totalDurationSec,
  nowMs = Date.now(),
}: TimerSnapshotInput): TimerSnapshot {
  const endMs = parseTime(completesAt);
  if (endMs == null) {
    return { remainingMs: 0, remainingSec: 0, progressPct: 0, isDue: false };
  }

  const derivedStartMs =
    parseTime(startedAt) ??
    (totalDurationSec && totalDurationSec > 0 ? endMs - totalDurationSec * 1000 : null);
  const remainingMs = Math.max(0, endMs - nowMs);
  const remainingSec = Math.ceil(remainingMs / 1000);

  if (derivedStartMs == null || derivedStartMs >= endMs) {
    return {
      remainingMs,
      remainingSec,
      progressPct: nowMs >= endMs ? 100 : 0,
      isDue: nowMs >= endMs,
    };
  }

  const totalMs = endMs - derivedStartMs;
  const elapsedMs = Math.min(totalMs, Math.max(0, nowMs - derivedStartMs));
  return {
    remainingMs,
    remainingSec,
    progressPct: Math.min(100, Math.max(0, Math.round((elapsedMs / totalMs) * 100))),
    isDue: nowMs >= endMs,
  };
}

export function formatTimerDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(rest).padStart(2, '0')}s`;
  }
  return `${minutes}m ${String(rest).padStart(2, '0')}s`;
}
