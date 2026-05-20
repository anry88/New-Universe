# `backend/src/workers` directory

This directory contains background processing workers for both BullMQ-driven delayed jobs and database polling ticks. With `ENABLE_BULLMQ=false`, delayed work runs through Postgres polling and online sync without starting BullMQ queue consumers.

## Files

- **`index.ts`** — worker entry point. It registers all workers (`createBuildingsWorker`, `createShipsWorker`, `createExpeditionsWorker`, `createNotificationsWorker`, `createCargoRoutesWorker`, `createResearchWorker`, `createProductionOrdersWorker`), manages their handles, and handles graceful shutdown.
- **`cargo-routes.ts`** — handles `arrive_cargo` jobs in the `expeditions` queue when BullMQ is enabled. Completes one-way cargo transfers by applying aggregated resources to the target planet, moving the ship to its new location, and reusing the same completion helper as online expedition sync; duplicate/concurrent jobs are safe because the helper conditionally claims active cargo expeditions before delivery. In `ENABLE_BULLMQ=false` mode this worker returns a no-op handle because `tick-expeditions` processes cargo rows from Postgres.
- **`scheduler.ts`** — small in-process interval scheduler used by periodic workers so recurring ticks do not consume Redis commands through BullMQ repeatable jobs. Exposes `createIntervalWorker`, `combineWorkerHandles`, and `removeLegacyRepeatableJobs`, which removes old BullMQ `tick` repeat metadata during worker startup after deployments from the previous scheduler model. `removeLegacyRepeatableJobs` is skipped when `ENABLE_BULLMQ=false`.
- **`tick-buildings.ts`** — processes completed construction and upgrade queue items from Postgres. Optional BullMQ delayed jobs only wake this same completion scan when `ENABLE_BULLMQ=true`; if enqueue fails or BullMQ is disabled, the interval worker and active-session sync still finalize due rows. When a building completes, it updates the planet's resource regeneration rates using each extractor building's saved `selected_resource_id`, syncs battery-backed energy storage/generation, and creates a notification for the user.
- **`tick-expeditions.ts`** — handles active expeditions. Every 30 seconds via the local interval scheduler, it iterates over all in-flight and returning expeditions, calculates their current position using **sector XY** linear interpolation (Z fixed to the origin system’s sector Z so fog-of-war matches the flat map), performs the sector fog-of-war visibility check for local/ordinary routes, and for recon ships scans the flat home-system route corridor against hidden planet positions from `@shared/format/systemMapLayout` before inserting newly visible `discovered_planets` and queuing `planet_discovered` notifications. Jump Gate scout routes do not reveal the whole destination sector: after the ship reaches the Home Gate leg, the worker scans only the destination Gate -> selected target point/planet segment and inserts public planets whose rendered footprint plus a scaled ship sensor corridor intersects that route. Home-planet route discovery uses each planet's rendered footprint (`systemMapPlanetDiscoveryRadius`) with a minimum practical corridor for small worlds and the same scaled ship sensor contribution, so larger bodies are easier to reveal while nearby fly-bys still work. Colonizer expeditions with `targetPlanetId` settle the selected planet on arrival, consume the ship only after atomically claiming the colony row, create the colony + level-1 Command Center, queue `colony_founded`, and do not return or re-run launch-time cooldown/limit gates. One-way deployment hulls (`combat`, `support`, `shield`, `missile` ship roles — see `isOneWayShipRole` in `shared/config/expeditionRouting.ts`) with a `targetPlanetId` dock the ship at the destination on arrival, delete the expedition, and emit an `expedition_arrived` notification instead of scheduling a return leg; local or Jump Gate point deployments without `targetPlanetId` transition the expedition to `status='stationed'` so combat and system maps keep the ship at the chosen tactical point. `processExpeditions({ userId, skipNotifications })` is also used by active-session sync, and the `/me` post-response lightweight mode adds `onlyDue` plus `skipVisibilityChecks` so the request path does not rescan every in-flight route.
- **`tick-ships.ts`** — processes ship construction queues. `completeShipBuildJob` finalizes only rows that are still `building` and due, inserts `ship_done` only for that successful update, and skips jobs already completed by active-session sync. In `ENABLE_BULLMQ=false` mode the module runs a 30s polling ticker (`processDueShips`) instead of a BullMQ queue consumer.
- **`tick-combat.ts`** — runs the authoritative combat simulation every 3 seconds through `features/combat/tick-combat.ts`. The combat processor discovers candidate combat systems read-only, including systems where docked, moving, or `stationed` orbital bombers can reach hostile colony buildings, then mutates each system in its own transaction under a Postgres advisory lock keyed by `systemId`; different systems can advance independently, while duplicate workers cannot double-apply the same system tick. Browser `/me` sync reads combat state but does not advance damage.
- **`notifications.ts`** — processes pending notifications from the database. Every minute via the local interval scheduler, it fetches all notifications with `pending=true`, groups them by user to respect rate limits (20/min), formats messages in the user's `preferredLocale`, checks shared notification category preferences (`building`, `ship`, `research`, `expedition`, `discovery`, `colony`, `cargo`, `combat`), marks disabled categories as skipped/read/non-pending, skips users currently marked with `telegram_notifications_blocked_at`, and sends enabled messages to Telegram. Terminal Telegram failures such as `403 Forbidden: bot was blocked by the user` mark the notification failed/non-pending and set `users.telegram_notifications_blocked_at`; `/start` clears that user flag before future pushes are attempted again.
- **`research.ts`** — periodic local interval worker (30s) that runs `processCompletedResearch` from `features/research/completion.ts` to finalize due tech tiers, invalidate effect memoization hooks, and enqueue `research_done` notifications when the tier was not already acknowledged online.
- **`production-orders.ts`** — periodic local interval worker (30s) that runs `ProductionService.processDueOrders` to pause production processes when active energy demand drains batteries, resume paused rows after charge returns, complete due queued rows, and credit their stored outputs.

## Adding a new worker

1. Create a `tick-<name>.ts` file following the existing patterns (periodic tick, optional BullMQ worker, or queue processor).
2. Export a `create<Name>Worker` function that initializes the Queue and Worker.
3. Import and register the new worker in `backend/src/workers/index.ts`.
4. Add a test file `tick-<name>.test.ts` and ensure it passes.
5. Update this README.

## Verification

Workers can be tested in isolation via their matching `*.test.ts` files:

```bash
docker compose exec backend npx vitest src/workers/tick-expeditions.test.ts
```

Economy idempotency coverage for repeated worker execution is also included in:

```bash
docker compose run --rm backend npm run security:economy
```
