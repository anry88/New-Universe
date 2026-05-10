# Roadmap Coverage Matrix

This document is a checkpoint for future planning reviews. It separates implemented-detail backlog from roadmap backlog so agents do not confuse MVP scope with full-game completion.

## Task Counts

| Phase | Current total tasks | Newly added tasks | Coverage meaning |
|---|---:|---:|---|
| P0 | 10 | 0 | Project setup and local development foundation |
| P1 | 37 | 0 | First playable solo MVP loop |
| P1.1 | 10 | 10 | Cosmic Atlas redesign + post-audit fixes for P0/P1 (see `ROADMAP_P1_1_FIXES.md`) |
| P2 | 25 | 22 | Solo expansion and balance validation |
| P3 | 9 | 6 | Multiplayer/social/economy foundations |
| P4 | 9 | 9 | Production launch readiness |
| P5 | 5 | 5 | Live operations after launch |

## Completion Gates

| Gate | Required evidence |
|---|---|
| MVP playable | P0/P1 issues closed, **P1.1 fix-epic closed (research/resources/onboarding bugs resolved)**, first-day E2E passes, Telegram auth works, resource/building/ship/expedition loop works |
| Phase 2 complete | Colonization E2E passes, market flow passes, research levels 1-3 work, balance simulator and P2 regression suite pass |
| Phase 3 ready | Two-player visibility model is proven, alliance membership works, player market settlement is safe |
| Launch ready | Staging deploy/rollback succeeds, backups restore, monitoring alerts fire, security checklist passes |
| Live ops ready | Event framework works, content validation exists, balance review loop and support runbook are usable |

## Phase 2 polish epic gate (P2-EPIC-POLISH)

Roll-up issue: [`P2-EPIC-POLISH`](https://github.com/anry88/New-Universe/issues/93) (depends on **P2-POL-001**, **P2-POL-002**, **P2-POL-003**). Evidence below satisfies the epic acceptance checklist before detailed Phase 3 execution planning.

| Acceptance criterion | Evidence in repo | How to verify locally |
|----------------------|------------------|------------------------|
| P2 balance simulator produces a reviewable first-week report | [`tools/balance-sim/`](../tools/balance-sim/README.md) — `scenarios/first-week.json`, `expected-ranges.json`, generated summaries under `artifacts/` (see `.gitkeep`) | `cd tools/balance-sim && npm ci && npm run simulate && npm run verify && npm test` |
| Content audit passes against catalog and localization expectations | [`backend/src/db/seed/audit.ts`](../backend/src/db/seed/audit.ts), [`backend/src/db/seed/audit.test.ts`](../backend/src/db/seed/audit.test.ts) | `cd backend && npm test` (includes audit test) or `npx vitest run src/db/seed/audit.test.ts` |
| Phase 2 regression suite passes locally and is documented | [`backend/tests/e2e/phase2-regression.test.ts`](../backend/tests/e2e/phase2-regression.test.ts), [`docs/testing/phase2-regression.md`](../docs/testing/phase2-regression.md) | `cd backend && npx vitest run tests/e2e/phase2-regression.test.ts` |
| Known P2 tuning risks recorded before Phase 3 task breakdown | [`docs/phase2/tuning-risks.md`](../docs/phase2/tuning-risks.md) | Reviewer read-through |

**Repository-wide CI mirror (Docker):** from repo root, `./scripts/ci-verify.sh` matches [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) (backend `npm test` includes audit + all e2e tests including Phase 2 regression). **Optional browser gate for epic PR merge:** add label **`run-e2e`** and/or `RUN_PLAYWRIGHT_E2E=1 ./scripts/ci-verify.sh` per [`.github/workflows/e2e.yml`](../.github/workflows/e2e.yml).

## Known Gaps After This Expansion

- P3 is still intentionally lighter than P2 and should be broken down again after Phase 2 regression is stable.
- Monetization is kept as readiness/design until analytics and security gates are in place.
- Admin UI is not fully specified yet; P5 support tasks define the runbook first.
- Deep PvP combat is not covered; current roadmap covers multiplayer presence, alliances, and market before combat.
- Full localization pipeline is represented through content-pack validation, but not yet through translator workflow tasks.
