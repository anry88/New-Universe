# `backend/src` directory

This is the backend application source. It is a Fastify v5 + TypeScript project that runs as ESM (`"type": "module"` in `backend/package.json`). All imports must use the `.js` extension because the runtime resolves compiled output, not raw `.ts` paths.

## Layout

- [`db/`](db/README.md) — Drizzle ORM client, schema (per-domain table modules), generated migrations, and seed scripts.
- [`config/`](config/README.md) — static balancing/config constants used by backend subsystems.
- [`features/`](features/README.md) — feature modules (`auth`, `bot`, `me`, `world`, `buildings`, `resources`, `ships`, `expeditions`, `research`, `tutorial`, `market`). Each feature owns its own route handlers, service logic, and tests.
- [`lib/`](lib/README.md) — shared infrastructure: env validation, logger, Sentry, Telegram `initData` validation.
- [`middleware/`](middleware/README.md) — Fastify hooks: request ID generator, Telegram auth `preHandler`.
- [`routes/`](routes/README.md) — top-level routes that are not feature-scoped (`/health`, `/webhook/telegram`, `/market/*`).
- [`workers/`](workers/README.md) — BullMQ workers for periodic ticks (expeditions, buildings, ships, research, notifications, cargo).
- `types/` — global TypeScript module augmentations.

## Top-level files

- **`index.ts`** — the application entry point. Order of operations:
  1. Imports `./lib/sentry.js` first so Sentry can capture early-startup errors.
  2. Builds a Fastify instance with the Pino `logger`, disables built-in request logging in production, sets the request ID generator from `middleware/request-id.ts`, and labels the ID as `requestId`.
  3. Adds a `preHandler` hook that creates a per-request child logger with `userId` once `request.user` has been attached by an auth middleware.
  4. Registers `@fastify/cors` and `@fastify/helmet` globally.
  5. Registers `healthRoutes`, `botRoutes`, `authRoutes` (mounted at `/auth`), `meRoutes` (mounted at `/me`), `buildingsRoutes` (mounted at `/buildings`), `resourcesRoutes` (mounted at `/resources`), `shipsRoutes` (mounted at `/ships`), `expeditionsRoutes` (mounted at `/expeditions`), `researchRoutes` (mounted at `/research`), `tutorialRoutes` (mounted at `/tutorial`), and `marketRoutes` (`/market/offers`, `/market/orders`, `/market/orders/:orderId/cancel`).
  6. Calls `fastify.listen({ port: env.PORT, host: '0.0.0.0' })`. On failure, logs and exits with code `1`.
- **`test-env.ts`** — Vitest environment shim that pre-populates the env vars Zod requires, so `lib/env.ts` does not abort the process when tests load it. Imported via `vitest-setup.ts`.
- **`vitest-setup.ts`** — Vitest `setupFiles` entry. Runs once per worker before tests, currently delegates to `test-env.ts`.
- **`types/fastify.d.ts`** — augments `FastifyRequest` with `user?: TelegramUser` so middleware can attach the verified Telegram user typed end-to-end.

## Adding a new HTTP route

1. If the new endpoint belongs to an existing feature (`auth`, `world`), add it to that feature's `routes.ts` and keep business logic in the matching `service.ts`.
2. If it is a brand-new feature, create `backend/src/features/<name>/{routes.ts,service.ts}` and register the routes from `index.ts` with an appropriate prefix.
3. If it is generic infrastructure (health, webhook receiver, status), put it in `routes/`.
4. Update [`backend/src/README.md`](README.md) and the package README closest to the change ([`features/README.md`](features/README.md) or [`routes/README.md`](routes/README.md)) so the file list stays accurate.

## Adding a new database table

1. Create a per-domain module in [`backend/src/db/schema/`](db/README.md) (e.g. `schema/alliances.ts`) and `export *` it from `db/schema.ts`.
2. Run `npm run db:generate` to produce a new SQL migration under `backend/src/db/migrations/`.
3. If the table needs reference data, add a seeder under `backend/src/db/seed/` and call it from `backend/src/db/seed.ts`.
4. Add or update tests for any service that reads/writes the new table.
5. Update [`backend/src/db/README.md`](db/README.md) to document the new table.

## Verification commands

The repository ships with the following npm scripts in `backend/package.json` (all expected to be run inside the `backend` workspace, typically through `docker compose exec backend ...`):

- `npm run dev` — `tsx watch src/index.ts` (hot reload for local development).
- `npm run build` — `tsc` typecheck + emit to `dist/`.
- `npm test` / `npm run test:watch` — Vitest run / watch mode for unit/integration tests.
- `npm run test:e2e` — Vitest run for end-to-end integration tests.
- `npm run lint` — ESLint over `*.ts`.

- `npm run db:generate` / `db:migrate` / `db:seed` / `db:studio` — Drizzle Kit operations.
