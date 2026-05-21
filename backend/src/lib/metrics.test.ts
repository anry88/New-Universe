import { describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { playerActivityDaily, users } from '../db/schema.js';
import {
  formatActivityTimestamp,
  formatMetricSamples,
  metricsMachineId,
  recordPlayerActivity,
  startPlayerActivitySession,
} from './metrics.js';

async function createMetricsUser() {
  const tgId = BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));
  const [user] = await db.insert(users).values({ tgId, tgFirstName: 'MetricsTest' }).returning();
  return user;
}

async function loadActivity(userId: string, activityDate: string) {
  const [row] = await db
    .select()
    .from(playerActivityDaily)
    .where(and(
      eq(playerActivityDaily.userId, userId),
      eq(playerActivityDaily.activityDate, activityDate),
    ));
  return row;
}

describe('metrics formatting', () => {
  it('renders Prometheus text exposition with escaped labels', () => {
    const output = formatMetricSamples([
      {
        name: 'nu_test_metric_total',
        help: 'Test counter',
        type: 'counter',
        value: 2,
        labels: { route: '/auth/"telegram"', method: 'POST' },
      },
    ]);

    expect(output).toContain('# HELP nu_test_metric_total Test counter');
    expect(output).toContain('# TYPE nu_test_metric_total counter');
    expect(output).toContain('nu_test_metric_total{method="POST",route="/auth/\\"telegram\\""} 2');
  });

  it('emits histogram metadata under the base family name', () => {
    const output = formatMetricSamples([
      {
        name: 'nu_http_request_duration_seconds_bucket',
        help: 'HTTP duration',
        type: 'histogram',
        value: 1,
        labels: { le: '+Inf' },
      },
      {
        name: 'nu_http_request_duration_seconds_count',
        help: 'HTTP duration',
        type: 'histogram',
        value: 1,
      },
    ]);

    expect(output).toContain('# TYPE nu_http_request_duration_seconds histogram');
    expect(output).toContain('nu_http_request_duration_seconds_bucket{le="+Inf"} 1');
    expect(output).toContain('nu_http_request_duration_seconds_count 1');
  });

  it('renders signed product deltas and progression milestone counts', () => {
    const output = formatMetricSamples([
      {
        name: 'nu_product_players_active_delta',
        help: 'Active player delta',
        type: 'gauge',
        value: -4,
        labels: { window: 'day' },
      },
      {
        name: 'nu_product_progression_players',
        help: 'Progression milestone',
        type: 'gauge',
        value: 12,
        labels: { milestone: 'tutorial_completed' },
      },
    ]);

    expect(output).toContain('nu_product_players_active_delta{window="day"} -4');
    expect(output).toContain('nu_product_progression_players{milestone="tutorial_completed"} 12');
  });

  it('formats activity timestamps as SQL-safe strings', () => {
    expect(formatActivityTimestamp(new Date('2026-05-20T10:00:00.000Z'))).toBe(
      '2026-05-20T10:00:00.000Z',
    );
  });

  it('normalizes Fly machine ids for HTTP metric labels', () => {
    expect(metricsMachineId({ FLY_MACHINE_ID: '  e8226d6c3936d8  ' })).toBe('e8226d6c3936d8');
    expect(metricsMachineId({ FLY_MACHINE_ID: 'rough fog' })).toBe('rough_fog');
    expect(metricsMachineId({})).toBe('local');
  });

  it('ignores online activity pings before an explicit session start', async () => {
    const user = await createMetricsUser();
    try {
      await recordPlayerActivity(user.id, new Date('2026-05-20T10:00:00.000Z'));

      await expect(loadActivity(user.id, '2026-05-20')).resolves.toBeUndefined();
    } finally {
      await db.delete(users).where(eq(users.id, user.id));
    }
  });

  it('starts sessions explicitly and accumulates online request time without gap caps', async () => {
    const user = await createMetricsUser();
    try {
      await startPlayerActivitySession(user.id, new Date('2026-05-20T10:00:00.000Z'));
      await recordPlayerActivity(user.id, new Date('2026-05-20T12:00:00.000Z'));

      let activity = await loadActivity(user.id, '2026-05-20');
      expect(activity).toMatchObject({
        playSeconds: 7_200,
        sessionCount: 1,
      });

      await startPlayerActivitySession(user.id, new Date('2026-05-20T15:00:00.000Z'));
      await recordPlayerActivity(user.id, new Date('2026-05-20T15:30:00.000Z'));

      activity = await loadActivity(user.id, '2026-05-20');
      expect(activity).toMatchObject({
        playSeconds: 9_000,
        sessionCount: 2,
      });
    } finally {
      await db.delete(users).where(eq(users.id, user.id));
    }
  });
});
