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
  - `TELEGRAM_BOT_SECRET` (default `'dev-secret-change-me'`).
  - `JWT_SECRET` (≥ 8 chars, required).
  - `SENTRY_DSN` (URL or empty, normalized to `undefined` when empty).
  
  On validation failure the module logs the formatted Zod error and calls `process.exit(1)`. The exported `env` is the only place to read these variables; never read `process.env.X` from feature code.
- **`logger.ts`** — exports a configured Pino instance:
  - Level comes from `env.LOG_LEVEL`.
  - `level` formatter uppercases label names so logs read `INFO`, `ERROR`, etc.
  - Timestamp uses ISO format (`pino.stdTimeFunctions.isoTime`).
  - Development uses `pino-pretty` with colorized output and `HH:MM:ss Z` time formatting; production logs are line-delimited JSON.
  
  Fastify wraps this instance via `loggerInstance: logger` in `index.ts`, so every `request.log` call inherits these settings and adds `requestId` plus `userId` (added by the `preHandler` hook).
- **`sentry.ts`** — initializes `@sentry/node` if `SENTRY_DSN` is present in `process.env`. Sets `tracesSampleRate: 1.0` and `environment: process.env.NODE_ENV || 'development'`. The module is intentionally imported as the very first line of `backend/src/index.ts` so Sentry can capture errors thrown during plugin registration. When the DSN is missing the module logs a warning and stays disabled.
- **`telegram.ts`** — Telegram Mini App `initData` validation per the [official algorithm](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app):
  - `TelegramUser` interface (`id`, `first_name`, optional `last_name`, `username`, `language_code`, `is_premium`, `allows_write_to_pm`).
  - `TelegramInitData` interface (`user`, `chat_instance`, `chat_type`, `auth_date`, `hash`).
  - `validateTelegramInitData(initData, botToken)`:
    - Parses the URL-encoded `initData`.
    - Sorts the keys alphabetically and joins them as `key=value` separated by `\n`.
    - Computes `secretKey = HMAC_SHA256('WebAppData', botToken)` and the expected `hash = HMAC_SHA256(secretKey, sortedString).hex`.
    - Returns `null` on any mismatch or missing hash; otherwise returns the parsed `TelegramInitData` (with `user` JSON-decoded and parse errors swallowed).
  - `isInitDataExpired(authDate, maxAgeInSeconds = 3600)` — boolean check that the auth timestamp is fresh (default 1-hour window). Used by `middleware/telegram-auth.ts` to short-circuit replays.

## Conventions

- New shared utility belongs here only if it has no feature awareness. Examples: token codecs, RNG helpers, retry wrappers. Anything domain-specific (research math, expedition routing) goes in `features/<name>/`.
- All modules in `lib/` should be free of side effects when imported, with two intentional exceptions: `env.ts` runs Zod validation at import time, and `sentry.ts` initializes the Sentry SDK at import time. Both behaviors are required by the application bootstrap order.
