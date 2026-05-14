# `backend/src/lib` directory

Shared infrastructure used across features, middleware, and routes. Anything in this folder must be free of feature-specific business logic so it stays reusable.

## Files

- **`env.ts`** — environment-variable validation. Loads `.env` via `dotenv.config()` and parses `process.env` against a Zod schema:
  - `NODE_ENV` ∈ `development | test | production`, default `development`.
  - `PORT` (coerced to `number`, default `3000`).
  - `LOG_LEVEL` ∈ `fatal | error | warn | info | debug | trace`, default `info`.
  - `DATABASE_URL` (URL, required).
  - `REDIS_URL` (URL, required).
  - `TELEGRAM_BOT_TOKEN` (non-empty string, required).
  - `TELEGRAM_BOT_SECRET` (default `'dev-secret-change-me'`; production must provide a 32+ character non-placeholder secret for Telegram webhook verification).
  - `TELEGRAM_APP_URL` / `PUBLIC_FRONTEND_URL` (optional outside production; production security validation requires both).
  - `ADMIN_TELEGRAM_IDS` (comma-separated list of allowed Telegram user IDs for admin actions, e.g. `111,222`).
  - `JWT_SECRET` (≥ 8 chars everywhere; production security validation requires 32+ characters and rejects placeholder text).
  - `SERVER_SECRET` (default dev-only secret used to derive deterministic home-system seeds; production security validation requires 32+ characters and rejects placeholder text).
  - `SENTRY_DSN` (URL or empty, normalized to `undefined` when empty).
  - `RATE_LIMIT_WINDOW`, `RATE_LIMIT_GLOBAL_MAX`, `RATE_LIMIT_AUTH_MAX`, `RATE_LIMIT_MUTATION_MAX`, `RATE_LIMIT_WEBHOOK_MAX`, `RATE_LIMIT_STORE` — Fastify rate-limit settings used by `rate-limit.ts`; `RATE_LIMIT_STORE=memory` keeps ordinary HTTP traffic off Redis, while `redis` enables a shared limiter for multi-replica deployments.
  - `DIAMOND_STARTING_GRANT` (integer ≥ 0, default `1000`) — diamonds granted when a new `users` row is created at first Telegram login.
  - `DIAMOND_RUSH_PER_MINUTE` (integer ≥ 1, default `1`) — rush pricing curve multiplier: `round((ceil(remainingSeconds / 60)^0.85) × rate)`, optional max via `DIAMOND_RUSH_MAX_PER_ACTION`.
  - `DIAMOND_RUSH_MAX_PER_ACTION` (integer ≥ 0, default `0`) — per-rush cap; `0` means uncapped.
  - `ENABLE_BULLMQ` (boolean, default `true`) — toggles BullMQ delayed jobs/workers and legacy repeatable-job cleanup. Set to `false` for Postgres polling plus online-sync completion paths without BullMQ enqueue/worker Redis traffic.
  
  On validation failure the module logs the formatted Zod error and calls `process.exit(1)`. In production it also calls `assertProductionSecurityConfig` so weak launch secrets fail at startup. The exported `env` is the only place to read these variables; never read `process.env.X` from feature code.
- **`i18n.ts`** — backend localization helpers for player-facing API errors. Exports `resolveRequestLocale(request, preferredLocale?)`, `apiErrorPayload(key, locale)`, and `sendLocalizedError(reply, request, statusCode, key, preferredLocale?)`; currently supports `en`/`ru` for auth/session/preference/internal error payloads and falls back to English.
- **`logger.ts`** — exports a configured Pino instance:
  - Level comes from `env.LOG_LEVEL`.
  - `level` formatter uppercases label names so logs read `INFO`, `ERROR`, etc.
  - Timestamp uses ISO format (`pino.stdTimeFunctions.isoTime`).
  - Development uses `pino-pretty` with colorized output and `HH:MM:ss Z` time formatting; production logs are line-delimited JSON.
  
  Fastify wraps this instance via `loggerInstance: logger` in `index.ts`, so every `request.log` call inherits these settings and adds `requestId` plus `userId` (added by the `preHandler` hook).
- **`sentry.ts`** — initializes `@sentry/node` if `SENTRY_DSN` is present in `process.env`. Sets `tracesSampleRate: 1.0` and `environment: process.env.NODE_ENV || 'development'`. The module is intentionally imported as the very first line of `backend/src/index.ts` so Sentry can capture errors thrown during plugin registration. When the DSN is missing the module logs a warning and stays disabled.
- **`diamonds.ts`** — rush pricing helpers aligned with [`shared/types/diamonds.ts`](../../../shared/types/diamonds.ts): `rushRemainingSeconds`, `rushDiamondCost` (reads `env` rates/caps), and `rushPricingMeta` for `GET /buildings/queue` transparency payloads.
- **`rate-limit.ts`** — Fastify rate-limit integration:
  - Exports `registerRateLimit(app)` for `index.ts`.
  - Uses Redis as the distributed store in production and in-memory limits outside production.
  - Exports `globalRateLimit`, `authRateLimit`, `mutationRateLimit`, and `webhookRateLimit` for per-route config.
  - `rateLimitKeyGenerator(request)` hashes bearer tokens / Telegram initData before using them as limiter keys so secrets are never stored as raw keys.
  - `registerRateLimit(app)` uses Fastify's in-memory limiter by default and only opens a Redis connection when `RATE_LIMIT_STORE=redis`.
- **`rate-limit.test.ts`** — verifies limiter key derivation does not expose raw tokens or raw Telegram initData.
- **`security.ts`** — security primitives shared by routes and env validation:
  - `securityRouteConfig(rateLimit, validation)` attaches auditable `config.rateLimit` and `config.security.validation` metadata to public mutation routes.
  - JSON-schema helpers (`objectBodySchema`, `paramsSchema`, `nonEmptyStringSchema`, `positiveNumberSchema`, etc.) keep route validation consistent.
  - `constantTimeEqual`, `verifyTelegramWebhookSecret`, and session-token helpers centralize security-sensitive comparisons and JWT parsing.
  - `productionSecurityErrors` / `assertProductionSecurityConfig` reject weak production launch config.
- **`security.test.ts`** — checks security primitives and audits the registered application route surface so every mutation route has rate-limit/validation metadata and schemas where required.
- **`telegram.ts`** — Telegram Mini App `initData` validation per the [official algorithm](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app):
  - `TelegramUser` interface (`id`, `first_name`, optional `last_name`, `username`, `language_code`, `is_premium`, `allows_write_to_pm`).
  - `TelegramInitData` interface (`user`, `chat_instance`, `chat_type`, `auth_date`, `hash`).
  - `validateTelegramInitData(initData, botToken)`:
    - Parses the URL-encoded `initData`.
    - Sorts the keys alphabetically and joins them as `key=value` separated by `\n`.
    - Computes `secretKey = HMAC_SHA256('WebAppData', botToken)` and the expected `hash = HMAC_SHA256(secretKey, sortedString).hex`.
    - Compares hashes with `constantTimeEqual`.
    - Rejects missing, malformed, zero, or unsafe `auth_date` values.
    - Returns `null` on any mismatch or missing hash; otherwise returns the parsed `TelegramInitData` (with `user` JSON-decoded and parse errors swallowed).
  - `isInitDataExpired(authDate, maxAgeInSeconds = 3600, maxFutureSkewInSeconds = 60)` — boolean check that the auth timestamp stays inside the accepted replay window. Used by `middleware/telegram-auth.ts` to reject stale or future-dated replays.

## Conventions

- New shared utility belongs here only if it has no feature awareness. Examples: token codecs, RNG helpers, retry wrappers. Anything domain-specific (research math, expedition routing) goes in `features/<name>/`.
- All modules in `lib/` should be free of side effects when imported, with two intentional exceptions: `env.ts` runs Zod validation at import time, and `sentry.ts` initializes the Sentry SDK at import time. Both behaviors are required by the application bootstrap order.
