# Production observability

Task: P4-OPS-001  
Target stack: Grafana + VictoriaMetrics / vmalert

This document defines the first monitoring surface for the closed-alpha production environment. It is intentionally pragmatic: one Prometheus-compatible scrape endpoint on the API process, VictoriaMetrics for time-series storage and alert evaluation, Grafana for dashboards, Sentry for exception detail, and provider dashboards for infrastructure limits.

## Runtime metrics endpoint

The backend exposes unauthenticated Prometheus text metrics at:

```text
GET /metrics
Content-Type: text/plain; version=0.0.4; charset=utf-8
```

The format is compatible with VictoriaMetrics and Grafana's Prometheus datasource. Scrape it from the private API network or through a protected production path; do not expose extra provider credentials in Grafana dashboard variables.

Minimal VictoriaMetrics scrape config:

```yaml
scrape_configs:
  - job_name: new-universe-api
    metrics_path: /metrics
    scheme: https
    scrape_interval: 30s
    static_configs:
      - targets:
          - api.example.com
```

Local smoke check after deploy:

```bash
curl -fsS https://api.example.com/metrics | head -n 40
```

Expected core lines include `nu_api_up`, `nu_db_available`, `nu_redis_available`, `nu_product_players_total`, and `nu_game_queue_oldest_due_seconds`.

## Dashboard and alert files

- Grafana dashboard JSON: [`docs/production/observability/grafana-dashboard.json`](observability/grafana-dashboard.json)
- VictoriaMetrics vmalert rules: [`docs/production/observability/vmalert-rules.yml`](observability/vmalert-rules.yml)

Import the dashboard into Grafana with a Prometheus-compatible datasource pointed at VictoriaMetrics. The dashboard uses datasource variable `DS_PROMETHEUS`, so it works with either the stock Prometheus datasource plugin or VictoriaMetrics' datasource plugin.

Run vmalert with the rules file:

```bash
vmalert \
  -datasource.url=http://victoria-metrics:8428 \
  -notifier.url=http://alertmanager:9093 \
  -rule=docs/production/observability/vmalert-rules.yml
```

## Product analytics metrics

Product analytics is aggregate-only and does not expose Telegram ids, usernames, names, raw requests, tokens, or per-user labels.

Activity is recorded on successful `/auth/telegram` and authenticated `GET /me`. The persisted rollup is `player_activity_daily`, keyed by internal `user_id` and UTC `activity_date`. Observed play time is accumulated from adjacent activity pings in the same UTC day, capped at 5 minutes per heartbeat and split into a new session after 30 minutes of inactivity.

| Metric | Labels | Meaning |
| --- | --- | --- |
| `nu_product_players_total` | none | Total registered players. |
| `nu_product_players_active` | `window=day|week|month` | Distinct active players in the current UTC day, rolling 7 days, or rolling 30 days. |
| `nu_product_players_active_previous` | `window` | Same metric for the comparable previous period. |
| `nu_product_players_active_change_ratio` | `window` | `(current - previous) / previous`; returns `1` when previous is zero and current is positive. |
| `nu_product_players_registered` | `window` | New player registrations in the current period. |
| `nu_product_players_registered_change_ratio` | `window` | Registration change versus the comparable previous period. |
| `nu_product_play_time_seconds_sum` | `window` | Total observed play time for the period. |
| `nu_product_play_time_seconds_avg_per_active_player` | `window` | Observed play time divided by active players. |
| `nu_product_session_seconds_avg` | `window` | Observed play time divided by session count. |
| `nu_product_system_development_avg` | `dimension` | Average development indicators: `power_score`, `active_colonies`, `completed_buildings`, `average_building_level`, `ships`, `research_levels`, `max_research_level`. |

The first day after deployment will undercount play time because activity starts accumulating only after the migration and code deploy are live.

## Operational metrics

| Metric | Labels | Meaning |
| --- | --- | --- |
| `nu_api_up` | none | API process can render `/metrics`. External scrape `up{job="new-universe-api"}` remains the authoritative API-down signal. |
| `nu_process_uptime_seconds` | none | API process uptime. |
| `nu_http_requests_total` | `method`, `route`, `status_code` | In-process HTTP request counter since last API restart. |
| `nu_http_request_duration_seconds_*` | `method`, `route`, `le` | In-process HTTP duration histogram since last API restart. |
| `nu_db_available` / `nu_db_ping_seconds` | none | Postgres health from the metrics collector. |
| `nu_redis_available` / `nu_redis_ping_seconds` | none | Redis health from the metrics collector. |
| `nu_game_queue_items` | `queue`, `state` | Source-of-truth game work rows grouped by queue and state. Queues: `buildings`, `ships`, `research`, `expeditions`, `notifications`, `production_orders`. |
| `nu_game_queue_oldest_due_seconds` | `queue` | Oldest due work item age by queue. This is the primary worker-stuck signal. |
| `nu_metrics_collection_success` | `collector=database|redis` | Collector health for partial `/metrics` failures. |

## Alert thresholds

Critical alerts are in `vmalert-rules.yml`. Thresholds start conservative for closed alpha and should be tuned from observed traffic.

| Alert | Expression summary | Severity | Runbook |
| --- | --- | --- | --- |
| API down | `up{job="new-universe-api"} == 0` for 2m | critical | [API down](#api-down) |
| DB unavailable | `nu_db_available == 0` for 1m | critical | [DB unavailable](#db-unavailable) |
| Worker stuck | any core queue oldest due age > 300s for 5m | critical | [Worker stuck](#worker-stuck) |
| Queue backlog | due work rows > 50 for 10m | critical | [Queue backlog](#queue-backlog) |
| High error rate | 5xx rate > 5% of API traffic for 10m | critical | [High error rate](#high-error-rate) |
| Telegram webhook errors | webhook 5xx rate > 0 for 5m | critical | [Telegram bot](#telegram-bot) |
| Redis unavailable | `nu_redis_available == 0` for 5m | warning | [Redis unavailable](#redis-unavailable) |
| Product DAU drop | daily active players down > 50% after a 10-player baseline | warning | [Product analytics](#product-analytics) |

## Test alert

The rules file includes `NewUniverseTestAlert` with `expr: vector(0)`, so it never fires in production. To verify alert routing and runbook links, copy the rules file locally or into a staging-only override, change only that expression to `vector(1)`, reload vmalert, and confirm the notification includes the `runbook_url` annotation. Revert the staging override after the notification is received.

## Runbooks

### API down

1. Open the provider dashboard for the API runtime and check process status, deploy id, memory, and restart count.
2. Confirm `GET /health` and `GET /metrics` from outside and inside the provider network.
3. If the latest deploy caused the outage, roll the API back to the previous immutable image only when the database schema remains compatible.
4. If schema compatibility is uncertain, stop write traffic where possible and ship a forward fix.
5. Check Sentry for startup exceptions and `nu_db_available` / `nu_redis_available` for dependency failures.

### DB unavailable

1. Check Neon status, connection limits, storage, and branch availability.
2. Stop the worker if migrations, connection storms, or repeated queue retries could amplify writes.
3. Verify the `DATABASE_URL` secret in the API and worker runtimes.
4. If a migration caused the issue, prefer a forward fix. Use Neon restore/branching only as disaster recovery after accepting the data-loss window.

### Redis unavailable

1. Check Upstash/Redis provider availability, command quota, memory, and TLS/TCP endpoint status.
2. Verify `REDIS_URL` in API and worker runtimes.
3. If BullMQ compatibility or quota is the issue, set `ENABLE_BULLMQ=false` only as a deliberate fallback; Postgres polling and online sync remain the durable completion path.
4. Watch `nu_game_queue_oldest_due_seconds` after Redis recovers.

### Worker stuck

1. Check worker runtime status and logs first; the API can be healthy while worker ticks are stopped.
2. Inspect `nu_game_queue_oldest_due_seconds{queue=...}` to identify the stuck domain.
3. For `buildings`, `ships`, `research`, `expeditions`, or `production_orders`, confirm migrations finished and the worker is running the same image as the API.
4. If duplicate jobs or bad code may mutate state repeatedly, stop the worker before redeploying.
5. Restart the worker after the cause is fixed and watch due ages return to zero.

### Queue backlog

1. Split by `queue` and `state` in Grafana to identify whether backlog is due work, waiting timers, paused production, or pending notifications.
2. If only `notifications` grows, check Telegram Bot API responses, admin notification preferences, and user rate limiting.
3. If core due queues grow during normal traffic, scale the worker only after idempotency and database load are confirmed.
4. If backlog follows a deploy, roll forward or pause the worker according to the rollback runbook.

### High error rate

1. Check Grafana's route/status panels for the failing route.
2. Open Sentry for matching backend exceptions and frontend user-facing errors.
3. For 401/403 spikes, verify Telegram initData, webhook secret, and JWT secret rotation timing.
4. For 5xx spikes after a deploy, compare the deploy id to the error start time and decide rollback versus forward fix.

### Telegram bot

1. Check `POST /webhook/telegram` status codes and Sentry events.
2. Confirm the Telegram webhook URL and `TELEGRAM_BOT_SECRET` match the deployed API.
3. Check BotFather / Bot API status if all other API routes are healthy.
4. Payment-related webhook failures must stay non-2xx so Telegram retries; do not mask them as success.

### Product analytics

1. Confirm `/metrics` includes `nu_product_players_active{window="day"}` and `nu_product_play_time_seconds_sum`.
2. If activity drops but API traffic remains healthy, check frontend deploy, Telegram Mini App URL, auth failures, and Sentry frontend errors.
3. Treat the first day after metrics deployment as a baseline-building day; compare product trends only after at least one complete comparable period.
