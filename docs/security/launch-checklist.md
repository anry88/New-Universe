# Launch Security Checklist

This checklist is the launch gate for task **P4-SEC-001**. Keep it aligned with backend route behavior and GitHub CI security checks.

## API hardening

- [x] Global Fastify rate limiting is registered from `backend/src/lib/rate-limit.ts`.
- [x] Every public mutation route (`POST`, `PATCH`, `PUT`, `DELETE`) declares per-route `config.rateLimit` and `config.security.validation` metadata.
- [x] Payload-bearing mutation routes declare Fastify JSON schemas for body and/or params validation.
- [x] `npm run security:check` audits mutation-route rate-limit/validation metadata and schema coverage.
- [x] Telegram Bot webhook requests validate `X-Telegram-Bot-Api-Secret-Token` in production and reject wrong secrets whenever the header is supplied.

## Telegram auth replay rules

- [x] Telegram Mini App `initData` hashes are compared with constant-time equality.
- [x] Missing or malformed `auth_date` is rejected.
- [x] `auth_date` older than 1 hour is rejected.
- [x] `auth_date` more than 60 seconds in the future is rejected to limit future-dated replay.
- [x] The middleware rejects missing `user` payloads after hash validation.

## Secret handling

- [x] Runtime code reads secrets through validated `env` exports instead of feature-level `process.env` fallbacks.
- [x] Production startup rejects placeholder or short `JWT_SECRET`, `SERVER_SECRET`, and `TELEGRAM_BOT_SECRET`.
- [x] Production startup requires `PUBLIC_FRONTEND_URL` and `TELEGRAM_APP_URL`.
- [x] Production secrets must be provided by the deployment platform secret store or GitHub Environments/Actions secrets. Do not commit `.env`.

## GitHub flow

- [x] `.github/workflows/ci.yml` has a separate `security` job.
- [x] The `security` job runs migrations/seed data before `npm run security:check`, so database-backed exploit regressions run in the security stage.
- [x] `scripts/ci-verify.sh` runs the same backend security check before lint/build/tests.
- [x] Workflow docs describe `security` separately from the normal `check` job and Playwright E2E.

## Economy exploit review

- [x] [`economy-exploits.md`](economy-exploits.md) documents resource duplication, worker idempotency, cargo/resource loop review, market/trade accepted risk, and the focused regression suite.
- [x] `backend/tests/security/economy-exploits.test.ts` is included in `npm run security:check`.

## Manual review before launch

- [ ] Verify production deployment has strong values for `JWT_SECRET`, `SERVER_SECRET`, `TELEGRAM_BOT_SECRET`, `TELEGRAM_BOT_TOKEN`, `PUBLIC_FRONTEND_URL`, and `TELEGRAM_APP_URL`.
- [ ] Before enabling Telegram Stars purchases, configure `ADMIN_TELEGRAM_IDS` and a reachable `ADMIN_TELEGRAM_CHAT_IDS` support destination for `/paysupport` refunds.
- [ ] Configure the Telegram webhook with the same `TELEGRAM_BOT_SECRET` value used by the backend.
- [ ] Confirm branch protection requires both `security` and `check` jobs from `ci.yml`.
- [ ] Review rate-limit thresholds against production traffic and adjust `RATE_LIMIT_*` values if needed.
