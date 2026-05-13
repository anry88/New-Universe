# `backend/src/workers` directory

This directory contains BullMQ workers for background processing and periodic game logic updates. Each worker typically handles one domain-specific "tick" or queue.

## Files

- **`index.ts`** — worker entry point. It registers all workers (`createBuildingsWorker`, `createShipsWorker`, `createExpeditionsWorker`, `createNotificationsWorker`, `createCargoRoutesWorker`, `createResearchWorker`, `createProductionOrdersWorker`), manages their handles, and handles graceful shutdown.
- **`cargo-routes.ts`** — handles `arrive_cargo` jobs in the `expeditions` queue. Completes one-way cargo transfers by applying aggregated resources to the target planet, moving the ship to its new location, and reusing the same completion helper as online expedition sync; duplicate/concurrent jobs are safe because the helper conditionally claims active cargo expeditions before delivery.
- **`scheduler.ts`** — small in-process interval scheduler used by periodic workers so recurring ticks do not consume Redis commands through BullMQ repeatable jobs. Exposes `createIntervalWorker`, `combineWorkerHandles`, and `removeLegacyRepeatableJobs`, which removes old BullMQ `tick` repeat metadata during worker startup after deployments from the previous scheduler model.
- **`tick-buildings.ts`** — processes completed construction and upgrade queue items. When a building completes, it updates the planet's resource regeneration rates using each extractor building's saved `selected_resource_id`, syncs battery-backed energy storage/generation, and creates a notification for the user.
- **`tick-expeditions.ts`** — handles active expeditions. Every 30 seconds via the local interval scheduler, it iterates over all in-flight and returning expeditions, calculates their current position using **sector XY** linear interpolation (Z fixed to the origin system’s sector Z so fog-of-war matches the flat map), performs the sector fog-of-war visibility check, and for recon ships scans the flat home-system route corridor against hidden planet positions from `@shared/format/systemMapLayout` before inserting newly visible `discovered_planets`; targeted Jump Gate recon arrivals insert the selected public planet discovery idempotently. Home-planet route discovery uses each planet's rendered footprint (`systemMapPlanetDiscoveryRadius`) with a minimum practical corridor for small worlds, so larger bodies are easier to reveal while nearby fly-bys still work. Colonizer expeditions with `targetPlanetId` settle the selected planet on arrival, consume the ship only after atomically claiming the colony row, create the colony + level-1 Command Center, and do not return or re-run launch-time cooldown/limit gates. `processExpeditions({ userId, skipNotifications })` is also used by active-session `/me` sync so online completions finish immediately without Telegram pushes.
- **`tick-ships.ts`** — processes ship construction queues. `completeShipBuildJob` finalizes only rows that are still `building` and due, inserts `ship_done` only for that successful update, and skips jobs already completed by active-session sync.
- **`notifications.ts`** — processes pending notifications from the database. Every minute via the local interval scheduler, it fetches all notifications with `pending=true`, groups them by user to respect rate limits (20/min), and sends them to Telegram.
- **`research.ts`** — periodic local interval worker (30s) that runs `processCompletedResearch` from `features/research/completion.ts` to finalize due tech tiers, invalidate effect memoization hooks, and enqueue `research_done` notifications when the tier was not already acknowledged online.
- **`production-orders.ts`** — periodic local interval worker (30s) that runs `ProductionService.processDueOrders` to pause production processes when active energy demand drains batteries, resume paused rows after charge returns, complete due queued rows, and credit their stored outputs.


## Adding a new worker

1. Create a `tick-<name>.ts` file following the existing patterns (BullMQ worker + periodic tick or queue processor).
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
