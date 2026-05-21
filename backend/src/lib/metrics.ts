import { sql } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { STARS_DIAMOND_PACKS } from '@shared/config/monetization.js';
import { db } from '../db/index.js';
import { env } from './env.js';

const HTTP_DURATION_BUCKETS_SECONDS = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, Number.POSITIVE_INFINITY];
const PRODUCT_WINDOWS = ['day', 'week', 'month'] as const;
const QUEUE_NAMES = ['buildings', 'ships', 'research', 'expeditions', 'notifications', 'production_orders'] as const;
const ANALYTICS_METRICS_CACHE_TTL_MS = 5 * 60 * 1000;

type ProductWindow = (typeof PRODUCT_WINDOWS)[number];
type QueueName = (typeof QUEUE_NAMES)[number];
type MetricType = 'counter' | 'gauge' | 'histogram';
type MetricLabels = Record<string, string>;

interface MetricSample {
  name: string;
  help: string;
  type: MetricType;
  value: number;
  labels?: MetricLabels;
}

interface HttpCounter {
  method: string;
  route: string;
  statusCode: string;
  count: number;
}

interface HttpDuration {
  method: string;
  route: string;
  bucketCounts: number[];
  sum: number;
  count: number;
}

interface ProductPeriodRow {
  period: ProductWindow;
  active_players: unknown;
  previous_active_players: unknown;
  registered_players: unknown;
  previous_registered_players: unknown;
  play_seconds: unknown;
  previous_play_seconds: unknown;
  sessions: unknown;
  previous_sessions: unknown;
}

interface RegistrationSourcePeriodRow {
  period: ProductWindow;
  source_type: unknown;
  source: unknown;
  registered_players: unknown;
  previous_registered_players: unknown;
}

interface SystemDevelopmentRow {
  development_score: unknown;
  active_colonies: unknown;
  completed_buildings: unknown;
  average_building_level: unknown;
  ships: unknown;
  research_levels: unknown;
  max_research_level: unknown;
}

interface MonetizationFunnelRow {
  window: ProductWindow;
  pack_id: string;
  checkout_starts: unknown;
  purchases: unknown;
  refunded_purchases: unknown;
  stars_spent: unknown;
  diamonds_delivered: unknown;
}

interface ProgressionMilestoneRow {
  milestone: string;
  players: unknown;
}

interface QueueMetricRow {
  queue: QueueName;
  state: string;
  count: unknown;
  oldest_due_seconds: unknown;
}

const httpCounters = new Map<string, HttpCounter>();
const httpDurations = new Map<string, HttpDuration>();
let analyticsMetricsCache: { collectedAtMs: number; samples: MetricSample[] } | null = null;
let analyticsMetricsRefresh: Promise<MetricSample[]> | null = null;
let redisMetricsClient: InstanceType<typeof Redis> | null = null;

export async function startPlayerActivitySession(userId: string, now = new Date()): Promise<string> {
  const activityDate = now.toISOString().slice(0, 10);
  const activityTimestamp = formatActivityTimestamp(now);

  await db.execute(sql`
    INSERT INTO player_activity_daily (
      user_id,
      activity_date,
      first_seen_at,
      last_seen_at,
      play_seconds,
      session_count
    )
    VALUES (${userId}, ${activityDate}, ${activityTimestamp}, ${activityTimestamp}, 0, 1)
    ON CONFLICT (user_id, activity_date) DO UPDATE SET
      first_seen_at = LEAST(player_activity_daily.first_seen_at, EXCLUDED.first_seen_at),
      last_seen_at = GREATEST(player_activity_daily.last_seen_at, EXCLUDED.last_seen_at),
      session_count = player_activity_daily.session_count + CASE
        WHEN EXCLUDED.last_seen_at > player_activity_daily.last_seen_at
        THEN 1
        ELSE 0
      END
  `);

  return activityTimestamp;
}

export async function recordPlayerActivity(userId: string, now = new Date()): Promise<void> {
  const activityDate = now.toISOString().slice(0, 10);
  const activityTimestamp = formatActivityTimestamp(now);

  await db.execute(sql`
    UPDATE player_activity_daily
    SET
      play_seconds = player_activity_daily.play_seconds + CASE
        WHEN ${activityTimestamp}::timestamp > player_activity_daily.last_seen_at
        THEN EXTRACT(EPOCH FROM ${activityTimestamp}::timestamp - player_activity_daily.last_seen_at)::int
        ELSE 0
      END,
      last_seen_at = GREATEST(player_activity_daily.last_seen_at, ${activityTimestamp}::timestamp)
    WHERE user_id = ${userId}
      AND activity_date = ${activityDate}
      AND session_count > 0
  `);
}

export function formatActivityTimestamp(now: Date): string {
  return now.toISOString();
}

export function metricsMachineId(envValues: Record<string, string | undefined> = process.env): string {
  return envValues.FLY_MACHINE_ID ? normalizeLabelValue(envValues.FLY_MACHINE_ID) : 'local';
}

export function recordHttpRequest(input: {
  method: string;
  route: string;
  statusCode: number;
  durationSeconds: number;
}): void {
  const method = normalizeLabelValue(input.method.toUpperCase());
  const route = normalizeRoute(input.route);
  const statusCode = String(input.statusCode);
  const durationSeconds = Number.isFinite(input.durationSeconds) && input.durationSeconds >= 0
    ? input.durationSeconds
    : 0;
  const counterKey = [method, route, statusCode].join('|');
  const durationKey = [method, route].join('|');

  const counter = httpCounters.get(counterKey) ?? { method, route, statusCode, count: 0 };
  counter.count += 1;
  httpCounters.set(counterKey, counter);

  const duration = httpDurations.get(durationKey) ?? {
    method,
    route,
    bucketCounts: HTTP_DURATION_BUCKETS_SECONDS.map(() => 0),
    sum: 0,
    count: 0,
  };
  duration.sum += durationSeconds;
  duration.count += 1;
  HTTP_DURATION_BUCKETS_SECONDS.forEach((bucket, index) => {
    if (durationSeconds <= bucket) {
      duration.bucketCounts[index] += 1;
    }
  });
  httpDurations.set(durationKey, duration);
}

export async function collectNewUniverseMetrics(): Promise<string> {
  const samples: MetricSample[] = [
    {
      name: 'nu_api_up',
      help: 'New Universe API process is able to render the metrics endpoint.',
      type: 'gauge',
      value: 1,
    },
    {
      name: 'nu_process_uptime_seconds',
      help: 'New Universe API process uptime in seconds.',
      type: 'gauge',
      value: process.uptime(),
    },
  ];

  appendHttpMetricSamples(samples);
  await appendDatabaseMetricSamples(samples);
  await appendRedisMetricSamples(samples);

  return formatMetricSamples(samples);
}

export function formatMetricSamples(samples: MetricSample[]): string {
  const lines: string[] = [];
  const emittedFamilies = new Set<string>();

  for (const sample of samples) {
    const familyName = metricFamilyName(sample.name, sample.type);
    if (!emittedFamilies.has(familyName)) {
      lines.push(`# HELP ${familyName} ${escapeHelp(sample.help)}`);
      lines.push(`# TYPE ${familyName} ${sample.type}`);
      emittedFamilies.add(familyName);
    }

    lines.push(`${sample.name}${formatLabels(sample.labels)} ${formatMetricValue(sample.value)}`);
  }

  lines.push('');
  return lines.join('\n');
}

function appendHttpMetricSamples(samples: MetricSample[]): void {
  const machineId = metricsMachineId();

  for (const counter of httpCounters.values()) {
    samples.push({
      name: 'nu_http_requests_total',
      help: 'Total HTTP requests handled by the API process.',
      type: 'counter',
      value: counter.count,
      labels: {
        machine_id: machineId,
        method: counter.method,
        route: counter.route,
        status_code: counter.statusCode,
      },
    });
  }

  for (const duration of httpDurations.values()) {
    HTTP_DURATION_BUCKETS_SECONDS.forEach((bucket, index) => {
      samples.push({
        name: 'nu_http_request_duration_seconds_bucket',
        help: 'HTTP request duration histogram in seconds.',
        type: 'histogram',
        value: duration.bucketCounts[index] ?? 0,
        labels: {
          machine_id: machineId,
          method: duration.method,
          route: duration.route,
          le: bucket === Number.POSITIVE_INFINITY ? '+Inf' : String(bucket),
        },
      });
    });
    samples.push({
      name: 'nu_http_request_duration_seconds_sum',
      help: 'HTTP request duration histogram in seconds.',
      type: 'histogram',
      value: duration.sum,
      labels: {
        machine_id: machineId,
        method: duration.method,
        route: duration.route,
      },
    });
    samples.push({
      name: 'nu_http_request_duration_seconds_count',
      help: 'HTTP request duration histogram in seconds.',
      type: 'histogram',
      value: duration.count,
      labels: {
        machine_id: machineId,
        method: duration.method,
        route: duration.route,
      },
    });
  }
}

async function appendDatabaseMetricSamples(samples: MetricSample[]): Promise<void> {
  const startedAt = process.hrtime.bigint();

  try {
    await db.execute(sql`SELECT 1`);
    samples.push({
      name: 'nu_db_available',
      help: 'Postgres availability from the API metrics collector.',
      type: 'gauge',
      value: 1,
    });
    samples.push({
      name: 'nu_db_ping_seconds',
      help: 'Postgres ping latency from the API metrics collector.',
      type: 'gauge',
      value: elapsedSeconds(startedAt),
    });
    samples.push({
      name: 'nu_metrics_collection_success',
      help: 'Whether a metrics collector completed successfully.',
      type: 'gauge',
      value: 1,
      labels: { collector: 'database' },
    });

    await appendQueueMetricSamples(samples);
    await appendCachedAnalyticsMetricSamples(samples);
  } catch {
    samples.push({
      name: 'nu_db_available',
      help: 'Postgres availability from the API metrics collector.',
      type: 'gauge',
      value: 0,
    });
    samples.push({
      name: 'nu_metrics_collection_success',
      help: 'Whether a metrics collector completed successfully.',
      type: 'gauge',
      value: 0,
      labels: { collector: 'database' },
    });
  }
}

async function appendCachedAnalyticsMetricSamples(samples: MetricSample[]): Promise<void> {
  const nowMs = Date.now();
  if (analyticsMetricsCache && nowMs - analyticsMetricsCache.collectedAtMs < ANALYTICS_METRICS_CACHE_TTL_MS) {
    appendAnalyticsCacheSamples(samples, analyticsMetricsCache, nowMs, 1);
    return;
  }

  try {
    analyticsMetricsRefresh ??= collectAnalyticsMetricSamples();
    const refreshedSamples = await analyticsMetricsRefresh;
    analyticsMetricsRefresh = null;
    analyticsMetricsCache = {
      collectedAtMs: Date.now(),
      samples: refreshedSamples,
    };
    appendAnalyticsCacheSamples(samples, analyticsMetricsCache, Date.now(), 1);
  } catch {
    analyticsMetricsRefresh = null;
    if (analyticsMetricsCache) {
      appendAnalyticsCacheSamples(samples, analyticsMetricsCache, Date.now(), 0);
      return;
    }

    samples.push({
      name: 'nu_metrics_collection_success',
      help: 'Whether a metrics collector completed successfully.',
      type: 'gauge',
      value: 0,
      labels: { collector: 'product_analytics' },
    });
  }
}

async function collectAnalyticsMetricSamples(): Promise<MetricSample[]> {
  const samples: MetricSample[] = [];
  await appendProductMetricSamples(samples);
  await appendRegistrationSourceMetricSamples(samples);
  await appendSystemDevelopmentMetricSamples(samples);
  await appendMonetizationMetricSamples(samples);
  await appendProgressionMilestoneMetricSamples(samples);
  return samples;
}

function appendAnalyticsCacheSamples(
  samples: MetricSample[],
  cache: { collectedAtMs: number; samples: MetricSample[] },
  nowMs: number,
  success: number,
): void {
  samples.push(...cache.samples);
  samples.push({
    name: 'nu_product_analytics_cache_age_seconds',
    help: 'Age in seconds of the cached product analytics metrics payload.',
    type: 'gauge',
    value: Math.max(0, (nowMs - cache.collectedAtMs) / 1000),
  });
  samples.push({
    name: 'nu_metrics_collection_success',
    help: 'Whether a metrics collector completed successfully.',
    type: 'gauge',
    value: success,
    labels: { collector: 'product_analytics' },
  });
}

async function appendRedisMetricSamples(samples: MetricSample[]): Promise<void> {
  const startedAt = process.hrtime.bigint();

  try {
    const redis = getRedisMetricsClient();
    if (redis.status === 'wait') {
      await redis.connect();
    }
    await redis.ping();
    samples.push({
      name: 'nu_redis_available',
      help: 'Redis availability from the API metrics collector.',
      type: 'gauge',
      value: 1,
    });
    samples.push({
      name: 'nu_redis_ping_seconds',
      help: 'Redis ping latency from the API metrics collector.',
      type: 'gauge',
      value: elapsedSeconds(startedAt),
    });
    samples.push({
      name: 'nu_metrics_collection_success',
      help: 'Whether a metrics collector completed successfully.',
      type: 'gauge',
      value: 1,
      labels: { collector: 'redis' },
    });
  } catch {
    redisMetricsClient?.disconnect();
    redisMetricsClient = null;
    samples.push({
      name: 'nu_redis_available',
      help: 'Redis availability from the API metrics collector.',
      type: 'gauge',
      value: 0,
    });
    samples.push({
      name: 'nu_metrics_collection_success',
      help: 'Whether a metrics collector completed successfully.',
      type: 'gauge',
      value: 0,
      labels: { collector: 'redis' },
    });
  }
}

async function appendQueueMetricSamples(samples: MetricSample[]): Promise<void> {
  const rows = asRows<QueueMetricRow>(await db.execute(sql`
    WITH queue_rows AS (
      SELECT
        'buildings'::text AS queue,
        CASE WHEN queue_completes_at <= now() THEN 'due' ELSE 'waiting' END AS state,
        queue_completes_at AS due_at
      FROM buildings
      WHERE queue_action IS NOT NULL AND queue_completes_at IS NOT NULL
      UNION ALL
      SELECT
        'ships'::text AS queue,
        CASE WHEN queue_completes_at <= now() THEN 'due' ELSE 'waiting' END AS state,
        queue_completes_at AS due_at
      FROM ships
      WHERE status = 'building' AND queue_completes_at IS NOT NULL
      UNION ALL
      SELECT
        'research'::text AS queue,
        CASE WHEN completes_at <= now() THEN 'due' ELSE 'waiting' END AS state,
        completes_at AS due_at
      FROM research_progress
      WHERE completes_at IS NOT NULL
      UNION ALL
      SELECT
        'expeditions'::text AS queue,
        CASE WHEN eta <= now() THEN 'due' ELSE 'waiting' END AS state,
        eta AS due_at
      FROM expeditions
      WHERE status IN ('queued', 'in_flight', 'returning')
      UNION ALL
      SELECT
        'notifications'::text AS queue,
        CASE WHEN created_at <= now() - INTERVAL '5 minutes' THEN 'due' ELSE 'waiting' END AS state,
        created_at + INTERVAL '5 minutes' AS due_at
      FROM notifications
      WHERE pending = true
      UNION ALL
      SELECT
        'production_orders'::text AS queue,
        CASE
          WHEN status = 'paused' THEN 'paused'
          WHEN completes_at <= now() THEN 'due'
          ELSE 'waiting'
        END AS state,
        completes_at AS due_at
      FROM production_orders
      WHERE status IN ('queued', 'paused')
    )
    SELECT
      queue,
      state,
      count(*)::float8 AS count,
      coalesce(max(greatest(extract(epoch FROM now() - due_at), 0)), 0)::float8 AS oldest_due_seconds
    FROM queue_rows
    GROUP BY queue, state
  `));

  const seenDueQueues = new Set<string>();
  for (const row of rows) {
    const queue = normalizeQueueName(row.queue);
    const state = normalizeLabelValue(row.state);
    const count = toNumber(row.count);
    samples.push({
      name: 'nu_game_queue_items',
      help: 'Game work items grouped by queue and state from Postgres source-of-truth rows.',
      type: 'gauge',
      value: count,
      labels: { queue, state },
    });

    if (state === 'due') {
      seenDueQueues.add(queue);
      samples.push({
        name: 'nu_game_queue_oldest_due_seconds',
        help: 'Age in seconds of the oldest due game work item by queue.',
        type: 'gauge',
        value: toNumber(row.oldest_due_seconds),
        labels: { queue },
      });
    }
  }

  for (const queue of QUEUE_NAMES) {
    if (!seenDueQueues.has(queue)) {
      samples.push({
        name: 'nu_game_queue_oldest_due_seconds',
        help: 'Age in seconds of the oldest due game work item by queue.',
        type: 'gauge',
        value: 0,
        labels: { queue },
      });
    }
  }
}

async function appendProductMetricSamples(samples: MetricSample[]): Promise<void> {
  const totalRows = asRows<{ total: unknown }>(await db.execute(sql`
    SELECT count(*)::float8 AS total FROM users
  `));
  const totalPlayers = toNumber(totalRows[0]?.total);

  samples.push({
    name: 'nu_product_players_total',
    help: 'Total registered players.',
    type: 'gauge',
    value: totalPlayers,
  });

  const periodRows = asRows<ProductPeriodRow>(await db.execute(sql`
    WITH periods AS (
      SELECT * FROM (VALUES
        ('day'::text, CURRENT_DATE, CURRENT_DATE + 1, CURRENT_DATE - 1, CURRENT_DATE),
        ('week'::text, CURRENT_DATE - 6, CURRENT_DATE + 1, CURRENT_DATE - 13, CURRENT_DATE - 6),
        ('month'::text, CURRENT_DATE - 29, CURRENT_DATE + 1, CURRENT_DATE - 59, CURRENT_DATE - 29)
      ) AS p(period, start_date, end_date, previous_start_date, previous_end_date)
    )
    SELECT
      period,
      (
        SELECT count(DISTINCT user_id)::float8
        FROM player_activity_daily
        WHERE activity_date >= start_date AND activity_date < end_date
      ) AS active_players,
      (
        SELECT count(DISTINCT user_id)::float8
        FROM player_activity_daily
        WHERE activity_date >= previous_start_date AND activity_date < previous_end_date
      ) AS previous_active_players,
      (
        SELECT count(*)::float8
        FROM users
        WHERE created_at >= start_date::timestamp AND created_at < end_date::timestamp
      ) AS registered_players,
      (
        SELECT count(*)::float8
        FROM users
        WHERE created_at >= previous_start_date::timestamp AND created_at < previous_end_date::timestamp
      ) AS previous_registered_players,
      (
        SELECT coalesce(sum(play_seconds), 0)::float8
        FROM player_activity_daily
        WHERE activity_date >= start_date AND activity_date < end_date
      ) AS play_seconds,
      (
        SELECT coalesce(sum(play_seconds), 0)::float8
        FROM player_activity_daily
        WHERE activity_date >= previous_start_date AND activity_date < previous_end_date
      ) AS previous_play_seconds,
      (
        SELECT coalesce(sum(session_count), 0)::float8
        FROM player_activity_daily
        WHERE activity_date >= start_date AND activity_date < end_date
      ) AS sessions,
      (
        SELECT coalesce(sum(session_count), 0)::float8
        FROM player_activity_daily
        WHERE activity_date >= previous_start_date AND activity_date < previous_end_date
      ) AS previous_sessions
    FROM periods
  `));

  for (const row of periodRows) {
    const period = PRODUCT_WINDOWS.includes(row.period) ? row.period : 'day';
    const activePlayers = toNumber(row.active_players);
    const previousActivePlayers = toNumber(row.previous_active_players);
    const registeredPlayers = toNumber(row.registered_players);
    const previousRegisteredPlayers = toNumber(row.previous_registered_players);
    const playSeconds = toNumber(row.play_seconds);
    const previousPlaySeconds = toNumber(row.previous_play_seconds);
    const sessions = toNumber(row.sessions);
    const previousSessions = toNumber(row.previous_sessions);

    samples.push({
      name: 'nu_product_players_active',
      help: 'Distinct active players in the current rolling product analytics window.',
      type: 'gauge',
      value: activePlayers,
      labels: { window: period },
    });
    samples.push({
      name: 'nu_product_players_active_previous',
      help: 'Distinct active players in the previous comparable product analytics window.',
      type: 'gauge',
      value: previousActivePlayers,
      labels: { window: period },
    });
    samples.push({
      name: 'nu_product_players_active_change_ratio',
      help: 'Relative active-player change versus the previous comparable window.',
      type: 'gauge',
      value: periodChangeRatio(activePlayers, previousActivePlayers),
      labels: { window: period },
    });
    samples.push({
      name: 'nu_product_players_active_delta',
      help: 'Absolute active-player change versus the previous comparable window.',
      type: 'gauge',
      value: activePlayers - previousActivePlayers,
      labels: { window: period },
    });
    samples.push({
      name: 'nu_product_players_registered',
      help: 'Newly registered players in the current rolling product analytics window.',
      type: 'gauge',
      value: registeredPlayers,
      labels: { window: period },
    });
    samples.push({
      name: 'nu_product_players_registered_previous',
      help: 'Newly registered players in the previous comparable product analytics window.',
      type: 'gauge',
      value: previousRegisteredPlayers,
      labels: { window: period },
    });
    samples.push({
      name: 'nu_product_players_registered_change_ratio',
      help: 'Relative registered-player change versus the previous comparable window.',
      type: 'gauge',
      value: periodChangeRatio(registeredPlayers, previousRegisteredPlayers),
      labels: { window: period },
    });
    samples.push({
      name: 'nu_product_players_registered_delta',
      help: 'Absolute registered-player change versus the previous comparable window.',
      type: 'gauge',
      value: registeredPlayers - previousRegisteredPlayers,
      labels: { window: period },
    });
    samples.push({
      name: 'nu_product_play_time_seconds_sum',
      help: 'Observed play time in seconds in the current product analytics window.',
      type: 'gauge',
      value: playSeconds,
      labels: { window: period },
    });
    samples.push({
      name: 'nu_product_play_time_seconds_avg_per_active_player',
      help: 'Average observed play time per active player in seconds for the current window.',
      type: 'gauge',
      value: activePlayers > 0 ? playSeconds / activePlayers : 0,
      labels: { window: period },
    });
    samples.push({
      name: 'nu_product_play_time_change_ratio',
      help: 'Relative observed play-time change versus the previous comparable window.',
      type: 'gauge',
      value: periodChangeRatio(playSeconds, previousPlaySeconds),
      labels: { window: period },
    });
    samples.push({
      name: 'nu_product_sessions_total',
      help: 'Observed player sessions in the current product analytics window.',
      type: 'gauge',
      value: sessions,
      labels: { window: period },
    });
    samples.push({
      name: 'nu_product_session_seconds_avg',
      help: 'Average observed seconds per session in the current product analytics window.',
      type: 'gauge',
      value: sessions > 0 ? playSeconds / sessions : 0,
      labels: { window: period },
    });
    samples.push({
      name: 'nu_product_sessions_change_ratio',
      help: 'Relative session-count change versus the previous comparable window.',
      type: 'gauge',
      value: periodChangeRatio(sessions, previousSessions),
      labels: { window: period },
    });
  }
}

async function appendRegistrationSourceMetricSamples(samples: MetricSample[]): Promise<void> {
  const rows = asRows<RegistrationSourcePeriodRow>(await db.execute(sql`
    WITH periods AS (
      SELECT * FROM (VALUES
        ('day'::text, CURRENT_DATE, CURRENT_DATE + 1, CURRENT_DATE - 1, CURRENT_DATE),
        ('week'::text, CURRENT_DATE - 6, CURRENT_DATE + 1, CURRENT_DATE - 13, CURRENT_DATE - 6),
        ('month'::text, CURRENT_DATE - 29, CURRENT_DATE + 1, CURRENT_DATE - 59, CURRENT_DATE - 29)
      ) AS p(period, start_date, end_date, previous_start_date, previous_end_date)
    ),
    current_registration_rows AS (
      SELECT
        periods.period,
        CASE
          WHEN users.registration_source = 'telegram_start' THEN 'telegram_start'
          WHEN users.registration_source = 'direct' THEN 'direct'
          ELSE 'unknown'
        END AS source_type,
        CASE
          WHEN users.registration_source = 'telegram_start'
            AND nullif(trim(users.registration_source_code), '') IS NOT NULL
            THEN users.registration_source_code
          WHEN users.registration_source = 'direct' THEN 'direct'
          ELSE 'unknown'
        END AS source
      FROM periods
      JOIN users
        ON users.created_at >= periods.start_date::timestamp
       AND users.created_at < periods.end_date::timestamp
    ),
    current_sources AS (
      SELECT
        period,
        source_type,
        source,
        count(*)::float8 AS registered_players
      FROM current_registration_rows
      GROUP BY period, source_type, source
    ),
    previous_registration_rows AS (
      SELECT
        periods.period,
        CASE
          WHEN users.registration_source = 'telegram_start' THEN 'telegram_start'
          WHEN users.registration_source = 'direct' THEN 'direct'
          ELSE 'unknown'
        END AS source_type,
        CASE
          WHEN users.registration_source = 'telegram_start'
            AND nullif(trim(users.registration_source_code), '') IS NOT NULL
            THEN users.registration_source_code
          WHEN users.registration_source = 'direct' THEN 'direct'
          ELSE 'unknown'
        END AS source
      FROM periods
      JOIN users
        ON users.created_at >= periods.previous_start_date::timestamp
       AND users.created_at < periods.previous_end_date::timestamp
    ),
    previous_sources AS (
      SELECT
        period,
        source_type,
        source,
        count(*)::float8 AS previous_registered_players
      FROM previous_registration_rows
      GROUP BY period, source_type, source
    ),
    source_windows AS (
      SELECT period, source_type, source FROM current_sources
      UNION
      SELECT period, source_type, source FROM previous_sources
    )
    SELECT
      source_windows.period,
      source_windows.source_type,
      source_windows.source,
      coalesce(current_sources.registered_players, 0)::float8 AS registered_players,
      coalesce(previous_sources.previous_registered_players, 0)::float8 AS previous_registered_players
    FROM source_windows
    LEFT JOIN current_sources
      ON current_sources.period = source_windows.period
     AND current_sources.source_type = source_windows.source_type
     AND current_sources.source = source_windows.source
    LEFT JOIN previous_sources
      ON previous_sources.period = source_windows.period
     AND previous_sources.source_type = source_windows.source_type
     AND previous_sources.source = source_windows.source
  `));

  const rowsByKey = new Map(rows.map((row) => [
    registrationSourceRowKey(row.period, row.source_type, row.source),
    row,
  ]));
  const emittedKeys = new Set<string>();

  for (const window of PRODUCT_WINDOWS) {
    for (const sourceType of ['direct', 'unknown'] as const) {
      const key = registrationSourceRowKey(window, sourceType, sourceType);
      emittedKeys.add(key);
      appendRegistrationSourceSamples(samples, rowsByKey.get(key) ?? {
        period: window,
        source_type: sourceType,
        source: sourceType,
        registered_players: 0,
        previous_registered_players: 0,
      });
    }
  }

  for (const row of rows) {
    const key = registrationSourceRowKey(row.period, row.source_type, row.source);
    if (!emittedKeys.has(key)) {
      appendRegistrationSourceSamples(samples, row);
    }
  }
}

function registrationSourceRowKey(period: unknown, sourceType: unknown, source: unknown): string {
  return `${String(period)}|${String(sourceType)}|${String(source)}`;
}

function appendRegistrationSourceSamples(samples: MetricSample[], row: RegistrationSourcePeriodRow): void {
  const window = PRODUCT_WINDOWS.includes(row.period) ? row.period : 'day';
  const sourceType = normalizeRegistrationSourceType(row.source_type);
  const source = normalizeRegistrationSourceLabel(row.source, sourceType);
  const registeredPlayers = toNumber(row.registered_players);
  const previousRegisteredPlayers = toNumber(row.previous_registered_players);
  const labels = {
    window,
    source_type: sourceType,
    source,
  };

  samples.push({
    name: 'nu_product_players_registered_by_source',
    help: 'Newly registered players grouped by captured registration source in the current product analytics window.',
    type: 'gauge',
    value: registeredPlayers,
    labels,
  });
  samples.push({
    name: 'nu_product_players_registered_by_source_previous',
    help: 'Newly registered players grouped by captured registration source in the previous comparable product analytics window.',
    type: 'gauge',
    value: previousRegisteredPlayers,
    labels,
  });
  samples.push({
    name: 'nu_product_players_registered_by_source_delta',
    help: 'Absolute registration-source difference versus the previous comparable window.',
    type: 'gauge',
    value: registeredPlayers - previousRegisteredPlayers,
    labels,
  });
}

async function appendSystemDevelopmentMetricSamples(samples: MetricSample[]): Promise<void> {
  const rows = asRows<SystemDevelopmentRow>(await db.execute(sql`
    WITH building_stats AS (
      SELECT
        coalesce(systems.owner_id, colonies.owner_id) AS user_id,
        count(buildings.id)::float8 AS completed_buildings,
        coalesce(avg(buildings.level), 0)::float8 AS average_building_level
      FROM systems
      JOIN planets ON planets.system_id = systems.id
      JOIN buildings ON buildings.planet_id = planets.id
      LEFT JOIN colonies ON colonies.planet_id = planets.id AND colonies.status = 'active'
      WHERE coalesce(systems.owner_id, colonies.owner_id) IS NOT NULL
        AND buildings.queue_action IS NULL
        AND buildings.destroyed_at IS NULL
      GROUP BY coalesce(systems.owner_id, colonies.owner_id)
    ),
    colony_stats AS (
      SELECT owner_id AS user_id, count(*)::float8 AS active_colonies
      FROM colonies
      WHERE status = 'active'
      GROUP BY owner_id
    ),
    ship_stats AS (
      SELECT owner_id AS user_id, count(*)::float8 AS ships
      FROM ships
      WHERE destroyed_at IS NULL
      GROUP BY owner_id
    ),
    research_stats AS (
      SELECT
        user_id,
        coalesce(sum(level), 0)::float8 AS research_levels,
        coalesce(max(level), 0)::float8 AS max_research_level
      FROM research_progress
      GROUP BY user_id
    )
    SELECT
      coalesce(avg(
        coalesce(colony_stats.active_colonies, 0) * 25
        + coalesce(building_stats.completed_buildings, 0) * 5
        + coalesce(building_stats.average_building_level, 0) * 2
        + coalesce(ship_stats.ships, 0) * 8
        + coalesce(research_stats.research_levels, 0) * 12
      ), 0)::float8 AS development_score,
      coalesce(avg(coalesce(colony_stats.active_colonies, 0)), 0)::float8 AS active_colonies,
      coalesce(avg(coalesce(building_stats.completed_buildings, 0)), 0)::float8 AS completed_buildings,
      coalesce(avg(coalesce(building_stats.average_building_level, 0)), 0)::float8 AS average_building_level,
      coalesce(avg(coalesce(ship_stats.ships, 0)), 0)::float8 AS ships,
      coalesce(avg(coalesce(research_stats.research_levels, 0)), 0)::float8 AS research_levels,
      coalesce(avg(coalesce(research_stats.max_research_level, 0)), 0)::float8 AS max_research_level
    FROM users
    LEFT JOIN building_stats ON building_stats.user_id = users.id
    LEFT JOIN colony_stats ON colony_stats.user_id = users.id
    LEFT JOIN ship_stats ON ship_stats.user_id = users.id
    LEFT JOIN research_stats ON research_stats.user_id = users.id
  `));

  const row = rows[0];
  const dimensions: Array<[string, unknown]> = [
    ['development_score', row?.development_score],
    ['active_colonies', row?.active_colonies],
    ['completed_buildings', row?.completed_buildings],
    ['average_building_level', row?.average_building_level],
    ['ships', row?.ships],
    ['research_levels', row?.research_levels],
    ['max_research_level', row?.max_research_level],
  ];

  for (const [dimension, value] of dimensions) {
    samples.push({
      name: 'nu_product_system_development_avg',
      help: 'Average player system development indicators.',
      type: 'gauge',
      value: toNumber(value),
      labels: { dimension },
    });
  }
}

async function appendMonetizationMetricSamples(samples: MetricSample[]): Promise<void> {
  const rows = asRows<MonetizationFunnelRow>(await db.execute(sql`
    WITH periods AS (
      SELECT * FROM (VALUES
        ('day'::text, CURRENT_DATE, CURRENT_DATE + 1),
        ('week'::text, CURRENT_DATE - 6, CURRENT_DATE + 1),
        ('month'::text, CURRENT_DATE - 29, CURRENT_DATE + 1)
      ) AS p(period, start_date, end_date)
    ),
    checkout_agg AS (
      SELECT
        periods.period AS period,
        star_checkout_attempts.pack_id,
        count(*)::float8 AS checkout_starts
      FROM periods
      JOIN star_checkout_attempts
        ON star_checkout_attempts.created_at >= periods.start_date::timestamp
       AND star_checkout_attempts.created_at < periods.end_date::timestamp
      GROUP BY periods.period, star_checkout_attempts.pack_id
    ),
    payment_agg AS (
      SELECT
        periods.period AS period,
        star_payments.pack_id,
        count(*)::float8 AS purchases,
        count(*) FILTER (WHERE star_payments.refunded = true)::float8 AS refunded_purchases,
        coalesce(sum(star_payments.price_stars) FILTER (WHERE star_payments.refunded = false), 0)::float8 AS stars_spent,
        coalesce(sum(star_payments.diamonds) FILTER (WHERE star_payments.refunded = false), 0)::float8 AS diamonds_delivered
      FROM periods
      JOIN star_payments
        ON star_payments.created_at >= periods.start_date::timestamp
       AND star_payments.created_at < periods.end_date::timestamp
      GROUP BY periods.period, star_payments.pack_id
    ),
    pack_windows AS (
      SELECT period, pack_id FROM checkout_agg
      UNION
      SELECT period, pack_id FROM payment_agg
    )
    SELECT
      pack_windows.period AS window,
      pack_windows.pack_id,
      coalesce(checkout_agg.checkout_starts, 0)::float8 AS checkout_starts,
      coalesce(payment_agg.purchases, 0)::float8 AS purchases,
      coalesce(payment_agg.refunded_purchases, 0)::float8 AS refunded_purchases,
      coalesce(payment_agg.stars_spent, 0)::float8 AS stars_spent,
      coalesce(payment_agg.diamonds_delivered, 0)::float8 AS diamonds_delivered
    FROM pack_windows
    LEFT JOIN checkout_agg
      ON checkout_agg.period = pack_windows.period
     AND checkout_agg.pack_id = pack_windows.pack_id
    LEFT JOIN payment_agg
      ON payment_agg.period = pack_windows.period
     AND payment_agg.pack_id = pack_windows.pack_id
  `));

  const rowsByKey = new Map(rows.map((row) => [monetizationRowKey(row.window, row.pack_id), row]));
  const emittedKeys = new Set<string>();

  for (const window of PRODUCT_WINDOWS) {
    for (const pack of STARS_DIAMOND_PACKS) {
      const key = monetizationRowKey(window, pack.id);
      emittedKeys.add(key);
      appendMonetizationFunnelSamples(samples, rowsByKey.get(key) ?? {
        window,
        pack_id: pack.id,
        checkout_starts: 0,
        purchases: 0,
        refunded_purchases: 0,
        stars_spent: 0,
        diamonds_delivered: 0,
      });
    }
  }

  for (const row of rows) {
    const key = monetizationRowKey(row.window, row.pack_id);
    if (!emittedKeys.has(key)) {
      appendMonetizationFunnelSamples(samples, row);
    }
  }
}

function monetizationRowKey(window: string, packId: string): string {
  return `${window}|${packId}`;
}

function appendMonetizationFunnelSamples(samples: MetricSample[], row: MonetizationFunnelRow): void {
  const window = PRODUCT_WINDOWS.includes(row.window) ? row.window : 'day';
  const packId = normalizeLabelValue(row.pack_id);
  const checkoutStarts = toNumber(row.checkout_starts);
  const purchases = toNumber(row.purchases);

  samples.push({
    name: 'nu_monetization_checkout_starts',
    help: 'Telegram Stars checkout invoice attempts created by the backend.',
    type: 'gauge',
    value: checkoutStarts,
    labels: { window, pack: packId },
  });
  samples.push({
    name: 'nu_monetization_purchases',
    help: 'Delivered Telegram Stars purchases recorded by the backend.',
    type: 'gauge',
    value: purchases,
    labels: { window, pack: packId },
  });
  samples.push({
    name: 'nu_monetization_refunded_purchases',
    help: 'Delivered Telegram Stars purchases that were later refunded.',
    type: 'gauge',
    value: toNumber(row.refunded_purchases),
    labels: { window, pack: packId },
  });
  samples.push({
    name: 'nu_monetization_stars_spent',
    help: 'Non-refunded Telegram Stars spent on delivered purchases.',
    type: 'gauge',
    value: toNumber(row.stars_spent),
    labels: { window, pack: packId },
  });
  samples.push({
    name: 'nu_monetization_diamonds_delivered',
    help: 'Diamonds delivered by non-refunded Telegram Stars purchases.',
    type: 'gauge',
    value: toNumber(row.diamonds_delivered),
    labels: { window, pack: packId },
  });
  samples.push({
    name: 'nu_monetization_checkout_conversion_ratio',
    help: 'Delivered purchase ratio from backend-created Telegram Stars checkout attempts.',
    type: 'gauge',
    value: checkoutStarts > 0 ? purchases / checkoutStarts : 0,
    labels: { window, pack: packId },
  });
}

async function appendProgressionMilestoneMetricSamples(samples: MetricSample[]): Promise<void> {
  const rows = asRows<ProgressionMilestoneRow>(await db.execute(sql`
    WITH player_progress AS (
      SELECT
        users.id AS user_id,
        users.tutorial_completed_at IS NOT NULL AS tutorial_completed,
        coalesce(discovered_planet_stats.planets_discovered, 0)::float8 AS planets_discovered,
        coalesce(building_stats.completed_buildings, 0)::float8 AS completed_buildings,
        coalesce(ship_stats.built_ships, 0)::float8 AS built_ships,
        coalesce(research_stats.research_levels, 0)::float8 AS research_levels
      FROM users
      LEFT JOIN (
        SELECT
          user_id,
          count(DISTINCT planet_id)::float8 AS planets_discovered
        FROM discovered_planets
        GROUP BY user_id
      ) AS discovered_planet_stats ON discovered_planet_stats.user_id = users.id
      LEFT JOIN (
        SELECT
          coalesce(systems.owner_id, colonies.owner_id) AS user_id,
          count(buildings.id)::float8 AS completed_buildings
        FROM systems
        JOIN planets ON planets.system_id = systems.id
        JOIN buildings ON buildings.planet_id = planets.id
        LEFT JOIN colonies ON colonies.planet_id = planets.id AND colonies.status = 'active'
        WHERE coalesce(systems.owner_id, colonies.owner_id) IS NOT NULL
          AND buildings.queue_action IS NULL
          AND buildings.destroyed_at IS NULL
        GROUP BY coalesce(systems.owner_id, colonies.owner_id)
      ) AS building_stats ON building_stats.user_id = users.id
      LEFT JOIN (
        SELECT
          owner_id AS user_id,
          count(*)::float8 AS built_ships
        FROM ships
        WHERE destroyed_at IS NULL
          AND status <> 'building'
        GROUP BY owner_id
      ) AS ship_stats ON ship_stats.user_id = users.id
      LEFT JOIN (
        SELECT
          user_id,
          coalesce(sum(level), 0)::float8 AS research_levels
        FROM research_progress
        GROUP BY user_id
      ) AS research_stats ON research_stats.user_id = users.id
    )
    SELECT 'tutorial_completed'::text AS milestone, count(*) FILTER (WHERE tutorial_completed)::float8 AS players FROM player_progress
    UNION ALL SELECT 'planets_discovered_ge_1', count(*) FILTER (WHERE planets_discovered >= 1)::float8 FROM player_progress
    UNION ALL SELECT 'planets_discovered_ge_3', count(*) FILTER (WHERE planets_discovered >= 3)::float8 FROM player_progress
    UNION ALL SELECT 'planets_discovered_ge_5', count(*) FILTER (WHERE planets_discovered >= 5)::float8 FROM player_progress
    UNION ALL SELECT 'planets_discovered_ge_10', count(*) FILTER (WHERE planets_discovered >= 10)::float8 FROM player_progress
    UNION ALL SELECT 'buildings_completed_ge_1', count(*) FILTER (WHERE completed_buildings >= 1)::float8 FROM player_progress
    UNION ALL SELECT 'buildings_completed_ge_5', count(*) FILTER (WHERE completed_buildings >= 5)::float8 FROM player_progress
    UNION ALL SELECT 'buildings_completed_ge_10', count(*) FILTER (WHERE completed_buildings >= 10)::float8 FROM player_progress
    UNION ALL SELECT 'buildings_completed_ge_25', count(*) FILTER (WHERE completed_buildings >= 25)::float8 FROM player_progress
    UNION ALL SELECT 'ships_built_ge_1', count(*) FILTER (WHERE built_ships >= 1)::float8 FROM player_progress
    UNION ALL SELECT 'ships_built_ge_3', count(*) FILTER (WHERE built_ships >= 3)::float8 FROM player_progress
    UNION ALL SELECT 'ships_built_ge_10', count(*) FILTER (WHERE built_ships >= 10)::float8 FROM player_progress
    UNION ALL SELECT 'research_levels_ge_1', count(*) FILTER (WHERE research_levels >= 1)::float8 FROM player_progress
    UNION ALL SELECT 'research_levels_ge_3', count(*) FILTER (WHERE research_levels >= 3)::float8 FROM player_progress
    UNION ALL SELECT 'research_levels_ge_8', count(*) FILTER (WHERE research_levels >= 8)::float8 FROM player_progress
    UNION ALL SELECT 'research_levels_ge_16', count(*) FILTER (WHERE research_levels >= 16)::float8 FROM player_progress
  `));

  for (const row of rows) {
    samples.push({
      name: 'nu_product_progression_players',
      help: 'Distinct players who reached a product progression milestone.',
      type: 'gauge',
      value: toNumber(row.players),
      labels: { milestone: normalizeLabelValue(row.milestone) },
    });
  }
}

function getRedisMetricsClient(): InstanceType<typeof Redis> {
  if (!redisMetricsClient) {
    redisMetricsClient = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 1000,
      commandTimeout: 1000,
    });
    redisMetricsClient.on('error', () => undefined);
  }

  return redisMetricsClient;
}

function asRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) {
    return result as T[];
  }

  const maybeRows = (result as { rows?: unknown } | null)?.rows;
  return Array.isArray(maybeRows) ? (maybeRows as T[]) : [];
}

function elapsedSeconds(startedAt: bigint): number {
  return Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function periodChangeRatio(current: number, previous: number): number {
  if (previous === 0) {
    return current > 0 ? 1 : 0;
  }

  return (current - previous) / previous;
}

function normalizeRoute(route: string): string {
  const normalized = normalizeLabelValue(route || 'unknown');
  if (normalized.length <= 120) {
    return normalized;
  }

  return `${normalized.slice(0, 117)}...`;
}

function normalizeQueueName(queue: string): QueueName {
  return (QUEUE_NAMES as readonly string[]).includes(queue) ? (queue as QueueName) : 'expeditions';
}

function normalizeRegistrationSourceType(value: unknown): string {
  const sourceType = typeof value === 'string' ? value.trim() : '';
  if (sourceType === 'direct' || sourceType === 'telegram_start') {
    return sourceType;
  }

  return 'unknown';
}

function normalizeRegistrationSourceLabel(value: unknown, sourceType: string): string {
  if (sourceType === 'direct') {
    return 'direct';
  }

  const source = typeof value === 'string' ? value.trim() : '';
  return source ? normalizeLabelValue(source) : 'unknown';
}

function normalizeLabelValue(value: string): string {
  return value.trim().replace(/\s+/g, '_') || 'unknown';
}

function metricFamilyName(name: string, type: MetricType): string {
  return type === 'histogram' ? name.replace(/_(bucket|sum|count)$/, '') : name;
}

function formatLabels(labels?: MetricLabels): string {
  if (!labels || Object.keys(labels).length === 0) {
    return '';
  }

  const formatted = Object.entries(labels)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}="${escapeLabelValue(value)}"`)
    .join(',');

  return `{${formatted}}`;
}

function formatMetricValue(value: number): string {
  if (!Number.isFinite(value)) {
    return '0';
  }

  return String(value);
}

function escapeLabelValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}

function escapeHelp(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, ' ');
}
