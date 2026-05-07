# `backend/src/routes` directory

Generic top-level routes that are not specific to a single feature module. Anything tied to a domain (auth, world, expeditions, …) belongs in [`backend/src/features/`](../features/README.md) instead.

## Files

- **`health.ts`** — `healthRoutes(fastify)` registers `GET /health`. Returns `{ status: 'ok', ts: ISO timestamp, uptime: process.uptime() }`. The endpoint is intentionally unauthenticated and serves Docker / Compose / load-balancer health checks. Do not add side effects here.
- **`bot.ts`** — `botRoutes(fastify)` registers `POST /webhook/telegram`. The handler currently logs the incoming update with `fastify.log.info({ body }, 'Received Telegram update')` and replies `200 OK` with `{ ok: true }`. When real bot logic lands, dispatch into a `features/bot/service.ts` rather than expanding this file. Telegram requires a 200-class response within ~30 seconds, so any heavy work should be handed off to a queue/worker.
- **`health.test.ts`** — Vitest coverage that boots a Fastify instance with `healthRoutes` registered and asserts the response shape and 200 status.

## Adding a top-level route

- Use a descriptive filename (`metrics.ts`, `version.ts`, …) and export `async function <name>Routes(fastify) { ... }`.
- Register it from `backend/src/index.ts` via `await fastify.register(<name>Routes)` (no prefix for global utilities) or with a prefix when grouping multiple endpoints (`{ prefix: '/internal' }`).
- Co-locate a Vitest test file that boots a minimal Fastify instance to assert the contract.
- Update this README so agents can find the new endpoint without grepping.
