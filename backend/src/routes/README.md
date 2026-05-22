# `backend/src/routes` directory

Generic top-level routes that are not specific to a single feature module. Anything tied to a domain (auth, world, expeditions, …) belongs in [`backend/src/features/`](../features/README.md) instead.

## Files

- **`health.ts`** — `healthRoutes(fastify)` registers `GET /health`. Returns `{ status: 'ok', ts: ISO timestamp, uptime: process.uptime() }`. The endpoint is intentionally unauthenticated and serves Docker / Compose / load-balancer health checks. Do not add side effects here.
- **`metrics.ts`** — `metricsRoutes(fastify)` registers `GET /metrics`. Returns Prometheus text exposition for VictoriaMetrics/Grafana through `collectNewUniverseMetrics()`, including API process health, HTTP request counters, Postgres/Redis availability, game queue due age/backlog, and aggregate product analytics. The endpoint is unauthenticated; production deployments should keep scrape access private or protected at the network edge.
- **`metrics.test.ts`** — route-level coverage for `/metrics` content type and response body using an injected collector.
- **`bot.ts`** — `botRoutes(fastify)` registers `POST /webhook/telegram` with webhook rate limiting, body-shape validation, and Telegram secret-token verification (`X-Telegram-Bot-Api-Secret-Token` is required in production and rejected when wrong if supplied). The handler logs safe update context (`updateId`, chat/from IDs, command when present), awaits `botService.processUpdate` from `features/bot`, and includes that context on processing errors. Telegram requires a 200-class response within ~30 seconds; awaiting processing lets payment/support failures surface as webhook failures so Telegram can retry instead of silently dropping fulfillment.
- **`bot.test.ts`** — route-level coverage for `/webhook/telegram`, including the payment-critical contract that processing failures return a non-2xx response instead of acknowledging the update.
- **`colonies.ts`** — `coloniesRoutes(fastify)` registers `POST /colonies/found` and `GET /colonies/eligibility/:planetId`. Requires JWT auth. Delegates founding to `foundColony`; eligibility returns the shared colonization gate result and accepts `routeMode=jump_gate` to skip only the local colony-distance gate for Jump Gate preflight UI.
- **`cargo.ts`** — `cargoRoutes(fastify)` registers `POST /cargo/transfer/preview` and `POST /cargo/transfer`. Requires JWT auth. Delegates previews to `previewCargoTransfer` for server-side ETA / fuel / Jump Fuel calculations, and delegates launches to `launchCargoTransfer` to send one transfer order with multiple resource load lines or an empty relocation flight between two player-owned settlements via a logistics-role cargo ship; cargo usage requires Logistics L1, explicit `routeMode='jump_gate'` routes connect Home/known common systems, and launch requests can top up ordinary fuel / Jump Fuel tanks from the origin planet before route costs are consumed from the ship tanks.
- **`multiplayer.ts`** — `multiplayerRoutes(fastify)` registers `GET /multiplayer/systems` for the Sector button's known-system anchors and `GET /multiplayer/sectors/:sx/:sy/:sz/presence` for one sector cube. Requires JWT auth. Returns anonymized sector markers for neutral systems, the viewer's assets, and visible foreign colonies/ships, including Jump Gate `stationed` point deployments (`features/multiplayer/presence.ts`).
- **`health.test.ts`** — Vitest coverage that boots a Fastify instance with `healthRoutes` registered and asserts the response shape and 200 status.

## Adding a top-level route

- Use a descriptive filename (`metrics.ts`, `version.ts`, …) and export `async function <name>Routes(fastify) { ... }`.
- Register it from `backend/src/index.ts` via `await fastify.register(<name>Routes)` (no prefix for global utilities) or with a prefix when grouping multiple endpoints (`{ prefix: '/internal' }`).
- Co-locate a Vitest test file that boots a minimal Fastify instance to assert the contract.
- Update this README so agents can find the new endpoint without grepping.
