# `backend/src/routes` directory

Generic top-level routes that are not specific to a single feature module. Anything tied to a domain (auth, world, expeditions, …) belongs in [`backend/src/features/`](../features/README.md) instead.

## Files

- **`health.ts`** — `healthRoutes(fastify)` registers `GET /health`. Returns `{ status: 'ok', ts: ISO timestamp, uptime: process.uptime() }`. The endpoint is intentionally unauthenticated and serves Docker / Compose / load-balancer health checks. Do not add side effects here.
- **`bot.ts`** — `botRoutes(fastify)` registers `POST /webhook/telegram` with webhook rate limiting, body-shape validation, and Telegram secret-token verification (`X-Telegram-Bot-Api-Secret-Token` is required in production and rejected when wrong if supplied). The handler logs safe update context (`updateId`, chat/from IDs, command when present), delegates update processing to `botService.processUpdate` from `features/bot`, and includes that context on async processing errors. Telegram requires a 200-class response within ~30 seconds, so processing is triggered asynchronously while the handler returns `{ ok: true }` immediately.
- **`colonies.ts`** — `coloniesRoutes(fastify)` registers `POST /colonies/found`. Requires JWT auth. Delegates to `foundColony` feature to establish a new player colony outside the home system.
- **`cargo.ts`** — `cargoRoutes(fastify)` registers `POST /cargo/transfer/preview` and `POST /cargo/transfer`. Requires JWT auth. Delegates previews to `previewCargoTransfer` for server-side ETA / fuel / Jump Fuel calculations, and delegates launches to `launchCargoTransfer` to send one transfer order with multiple resource load lines between two player-owned settlements via a logistics-role cargo ship; cargo usage requires Logistics L1, and explicit `routeMode='jump_gate'` routes connect Home/known common systems and reserve stored `jump_fuel` plus ordinary route `fuel` from the origin planet.
- **`multiplayer.ts`** — `multiplayerRoutes(fastify)` registers `GET /multiplayer/systems` for the Sector button's known-system anchors and `GET /multiplayer/sectors/:sx/:sy/:sz/presence` for one sector cube. Requires JWT auth. Returns anonymized sector markers for neutral systems, the viewer's assets, and visible foreign colonies/ships (`features/multiplayer/presence.ts`).
- **`health.test.ts`** — Vitest coverage that boots a Fastify instance with `healthRoutes` registered and asserts the response shape and 200 status.

## Adding a top-level route

- Use a descriptive filename (`metrics.ts`, `version.ts`, …) and export `async function <name>Routes(fastify) { ... }`.
- Register it from `backend/src/index.ts` via `await fastify.register(<name>Routes)` (no prefix for global utilities) or with a prefix when grouping multiple endpoints (`{ prefix: '/internal' }`).
- Co-locate a Vitest test file that boots a minimal Fastify instance to assert the contract.
- Update this README so agents can find the new endpoint without grepping.
