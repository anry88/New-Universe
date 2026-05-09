# `backend/src/workers` directory

This directory contains BullMQ workers for background processing and periodic game logic updates. Each worker typically handles one domain-specific "tick" or queue.

## Files

- **`index.ts`** — worker entry point. It registers all workers (`createBuildingsWorker`, `createShipsWorker`, `createExpeditionsWorker`, `createNotificationsWorker`, `createCargoRoutesWorker`), manages their Redis connections, and handles graceful shutdown.
- **`cargo-routes.ts`** — handles `arrive_cargo` jobs in the `expeditions` queue. Completes cargo transfers by applying resources to the target planet and moving the ship to its new location.
- **`tick-buildings.ts`** — processes completed construction and upgrade queue items. When a building completes, it updates the planet's resource regeneration rates and creates a notification for the user.
- **`tick-expeditions.ts`** — handles active expeditions. Every 30 seconds, it iterates over all in-flight and returning expeditions, calculates their current position using linear interpolation, and performs a fog-of-war visibility check. It also handles transitions between journey segments (arrival at target, return home).
- **`tick-ships.ts`** — processes ship construction queues. When a ship build completes, it increments the ship count for the planet or adds the ship to the player's fleet and creates a notification.
- **`notifications.ts`** — processes pending notifications from the database. Every minute, it fetches all notifications with `pending=true`, groups them by user to respect rate limits (20/min), and sends them to Telegram.


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
