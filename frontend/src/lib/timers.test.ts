import { describe, expect, it } from 'vitest';
import { timerSnapshot } from './timers';

describe('timerSnapshot', () => {
  it('computes remaining time and progress from explicit server timestamps', () => {
    const snapshot = timerSnapshot({
      startedAt: '2026-05-11T10:00:00.000Z',
      completesAt: '2026-05-11T10:02:00.000Z',
      nowMs: new Date('2026-05-11T10:01:00.000Z').getTime(),
    });

    expect(snapshot.remainingSec).toBe(60);
    expect(snapshot.progressPct).toBe(50);
    expect(snapshot.isDue).toBe(false);
  });

  it('derives the start timestamp from total duration when the server omits startedAt', () => {
    const snapshot = timerSnapshot({
      completesAt: '2026-05-11T10:02:00.000Z',
      totalDurationSec: 120,
      nowMs: new Date('2026-05-11T10:01:30.000Z').getTime(),
    });

    expect(snapshot.remainingSec).toBe(30);
    expect(snapshot.progressPct).toBe(75);
  });

  it('clamps due timers to zero remaining and full progress', () => {
    const snapshot = timerSnapshot({
      startedAt: '2026-05-11T10:00:00.000Z',
      completesAt: '2026-05-11T10:02:00.000Z',
      nowMs: new Date('2026-05-11T10:03:00.000Z').getTime(),
    });

    expect(snapshot.remainingMs).toBe(0);
    expect(snapshot.remainingSec).toBe(0);
    expect(snapshot.progressPct).toBe(100);
    expect(snapshot.isDue).toBe(true);
  });
});
