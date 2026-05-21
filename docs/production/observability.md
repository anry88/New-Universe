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

Activity is recorded by the backend from explicit frontend online-session signals. After Telegram login, the Mini App calls `POST /me/session/start` once for the new app opening; it also opens a fresh baseline when the document returns from hidden to visible. Subsequent authenticated requests from a visible tab carry `X-NU-Online-Activity: 1` and extend the current session from the previous online request. Hidden-tab/background refetches omit the header, and worker-driven completions such as construction or research do not write activity. The persisted rollup is `player_activity_daily`, keyed by internal `user_id` and UTC `activity_date`. Observed play time is accumulated from adjacent online requests in the same UTC day without a five-minute heartbeat cap and without splitting sessions after an inactivity gap; only another explicit session-start request increments the session count.

| Metric | Labels | Meaning |
| --- | --- | --- |
| `nu_product_players_total` | none | Total registered players. |
| `nu_product_players_active` | `window=day|week|month` | Distinct active players in the current UTC day, rolling 7 days, or rolling 30 days. |
| `nu_product_players_active_previous` | `window` | Same metric for the comparable previous period. |
| `nu_product_players_active_delta` | `window` | Absolute unique-player difference versus the comparable previous period. |
| `nu_product_players_active_change_ratio` | `window` | `(current - previous) / previous`; returns `1` when previous is zero and current is positive. |
| `nu_product_players_registered` | `window` | New player registrations in the current period. |
| `nu_product_players_registered_previous` | `window` | New player registrations in the comparable previous period. |
| `nu_product_players_registered_delta` | `window` | Absolute registration difference versus the comparable previous period. |
| `nu_product_players_registered_change_ratio` | `window` | Registration change versus the comparable previous period. |
| `nu_product_play_time_seconds_sum` | `window` | Total observed play time for the period. |
| `nu_product_play_time_seconds_avg_per_active_player` | `window` | Observed play time divided by active players. |
| `nu_product_session_seconds_avg` | `window` | Observed play time divided by session count. |
| `nu_product_system_development_avg` | `dimension` | Average development indicators: `development_score`, `active_colonies`, `completed_buildings`, `average_building_level`, `ships`, `research_levels`, `max_research_level`. `development_score` is computed from source-of-truth gameplay rows rather than the currently stale `users.power_score` field. |
| `nu_product_progression_players` | `milestone` | Distinct players who reached funnel milestones: `tutorial_completed`, `planets_discovered_ge_1|3|5|10`, `buildings_completed_ge_1|5|10|25`, `ships_built_ge_1|3|10`, `research_levels_ge_1|3|8|16`. |

The Grafana dashboard uses the absolute `*_delta` metrics for player comparisons so day/week/month changes are shown as player counts, not percentages. Ratio metrics remain available for alerts where a relative drop threshold is clearer than a raw count.

Product, progression, and monetization aggregates are cached inside the API process for 5 minutes. Ordinary health, HTTP, and queue metrics stay fresh on every scrape. This keeps `/metrics` light enough for a 30-second VictoriaMetrics scrape interval while still giving Grafana stable closed-alpha trend panels.

## Monetization metrics

The monetization funnel is backend-visible and aggregate-only. A checkout start means the backend successfully created a Telegram Stars invoice link for a diamond pack; a purchase means Telegram payment delivery was recorded in `star_payments`. The frontend does not write these metrics directly.

| Metric | Labels | Meaning |
| --- | --- | --- |
| `nu_monetization_checkout_starts` | `window=day|week|month`, `pack` | Backend-created Stars checkout attempts by pack. Emits zero series for all configured packs. |
| `nu_monetization_purchases` | `window`, `pack` | Delivered Stars purchases recorded by the backend. |
| `nu_monetization_refunded_purchases` | `window`, `pack` | Delivered purchases later refunded through support/admin flow. |
| `nu_monetization_stars_spent` | `window`, `pack` | Non-refunded Stars spent on delivered purchases. |
| `nu_monetization_diamonds_delivered` | `window`, `pack` | Diamonds delivered by non-refunded purchases. |
| `nu_monetization_checkout_conversion_ratio` | `window`, `pack` | `purchases / checkout_starts`; returns `0` when starts are zero. |

The first day after deployment will undercount play time because registration backfill only creates one baseline session per existing user; real play-time accumulation starts with post-deploy auth and `/me` heartbeats.

## Operational metrics

| Metric | Labels | Meaning |
| --- | --- | --- |
| `nu_api_up` | none | API process can render `/metrics`. This is the dashboard and alert signal for API availability, so staging/prod scrape-job label differences do not create false `No data` panels. |
| `nu_process_uptime_seconds` | none | API process uptime. |
| `nu_http_requests_total` | `machine_id`, `method`, `route`, `status_code` | In-process HTTP request counter since last API restart. `machine_id` comes from Fly's `FLY_MACHINE_ID` and prevents load-balanced `/metrics` scrapes from merging different process counters into one time series. |
| `nu_http_request_duration_seconds_*` | `machine_id`, `method`, `route`, `le` | In-process HTTP duration histogram since last API restart. `machine_id` keeps histogram buckets separated per API process before Grafana/VictoriaMetrics aggregate them. |
| `nu_db_available` / `nu_db_ping_seconds` | none | Postgres health from the metrics collector. |
| `nu_redis_available` / `nu_redis_ping_seconds` | none | Redis health from the metrics collector. |
| `nu_game_queue_items` | `queue`, `state` | Source-of-truth game work rows grouped by queue and state. Queues: `buildings`, `ships`, `research`, `expeditions`, `notifications`, `production_orders`. |
| `nu_game_queue_oldest_due_seconds` | `queue` | Oldest due work item age by queue. This is the primary worker-stuck signal. |
| `nu_metrics_collection_success` | `collector=database|redis|product_analytics` | Collector health for partial `/metrics` failures. |
| `nu_product_analytics_cache_age_seconds` | none | Age of the cached product/progression/monetization aggregate payload. |

The p95 latency panel uses a fixed 10-minute histogram rate, keeps `machine_id` and `method` in the query legend, and connects gaps up to 10 minutes. Closed-alpha traffic can be sparse enough that a short dynamic rate window has no samples; availability and error-rate panels remain the outage signals.

## Alert thresholds

Critical alerts are in `vmalert-rules.yml`. Thresholds start conservative for closed alpha and should be tuned from observed traffic.

| Alert | Expression summary | Severity | Runbook |
| --- | --- | --- | --- |
| API down | `nu_api_up` absent or `0` for 2m | critical | [API down](#api-down) |
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
