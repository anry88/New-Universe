# `backend/src/middleware` directory

Cross-cutting Fastify hooks and `preHandler` plugins. Everything in this folder must be safe to attach to any route — it should not depend on feature internals.

## Files

- **`request-id.ts`** — `generateRequestId(_req)` returns a UUID v4 from `uuid`. It is wired into Fastify via `genReqId: generateRequestId` in `backend/src/index.ts`, and the `requestIdLogLabel: 'requestId'` setting makes it appear in every log line for that request. Override this function only if you adopt an external trace-ID format (e.g. W3C Trace Context).
- **`telegram-auth.ts`** — `telegramAuthMiddleware(request, reply)` is a Fastify `preHandler`. It rejects the request with localized `401 Unauthorized` JSON (resolved from Telegram `language_code` when available, otherwise `Accept-Language`) in four cases:
  1. The `X-Telegram-Init-Data` header is missing or not a string.
  2. `validateTelegramInitData(initData, env.TELEGRAM_BOT_TOKEN)` returned `null` (bad hash).
  3. `isInitDataExpired(validatedData.auth_date)` is `true` (older than 1 hour, malformed, or more than 60 seconds in the future).
  4. The parsed `initData` did not contain a `user` field.
  
  On success it sets `request.user = validatedData.user` and `request.telegramInitData = validatedData` (typed via `types/fastify.d.ts`) so downstream handlers can read the verified Telegram user and safe fields such as `start_param` without re-parsing. The `index.ts` `preHandler` hook then enriches `request.log` with `userId: request.user.id` automatically.
- **`telegram-auth.test.ts`** — Vitest coverage for the failure paths plus the happy path, including stale and future-dated `auth_date` replay rejection.

## Adding a middleware

1. Implement it as `async function myMiddleware(request, reply): Promise<void>` so it can either call `reply.send(...)` to short-circuit or simply return to allow the request to proceed.
2. Co-locate the test file (`my-middleware.test.ts`).
3. Wire it through `app.addHook('preHandler', ...)` in `backend/src/index.ts` for global behavior, or pass it via `{ preHandler: [myMiddleware] }` on a single route when the scope is local.
4. Update this README so the file list stays accurate.
