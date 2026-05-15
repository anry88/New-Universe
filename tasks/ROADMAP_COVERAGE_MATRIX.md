# Roadmap Coverage Matrix

This document is a checkpoint for future planning reviews. It separates implemented-detail backlog from roadmap backlog so agents do not confuse MVP scope with full-game completion.

## Task Counts

| Phase | Current total tasks | Newly added tasks | Coverage meaning |
|---|---:|---:|---|
| P0 | 10 | 0 | Project setup and local development foundation |
| P1 | 37 | 0 | First playable solo MVP loop |
| P1.1 | 10 | 10 | Cosmic Atlas redesign + post-audit fixes for P0/P1 (see `ROADMAP_P1_1_FIXES.md`) |
| P2 | 25 | 22 | Solo expansion and balance validation |
| P2.1 | 19 | 19 | Gameplay fixes, i18n, realtime completion, and UX polish (see `ROADMAP_P2_1_GAMEPLAY.md`) |
| P2.2 | 12 | 12 | Building economy, planetary rules, energy, production, and cargo/colonizer regressions |
| P2.3 | 9 | 9 | Jump Gate, random jump, known Common Pool destinations, and gate-routed missions (see `ROADMAP_P2_3_JUMP_GATE.md`) |
| P3 | 20 | 20 | Multiplayer/social/economy foundations plus combat/weapons rollout |
| P4 | 9 | 9 | Production launch readiness |
| P5 | 5 | 5 | Live operations after launch |

## Completion Gates

| Gate | Required evidence |
|---|---|
| MVP playable | P0/P1 issues closed, **P1.1 fix-epic closed (research/resources/onboarding bugs resolved)**, first-day E2E passes, Telegram auth works, resource/building/ship/expedition loop works |
| Phase 2 complete | Colonization E2E passes, research levels 1-3 work, cargo transfer flow passes, balance simulator and P2 regression suite pass |
| Phase 2.1 complete | `P2.1-400` roll-up evidence is recorded in [`ROADMAP_P2_1_GAMEPLAY.md`](ROADMAP_P2_1_GAMEPLAY.md), all child issues `P2.1-401…418` are closed, default CI passes, and the closing PR runs the `run-e2e` browser smoke gate |
| Phase 2.3 complete | `P2.3-500` roll-up evidence is recorded in [`ROADMAP_P2_3_JUMP_GATE.md`](ROADMAP_P2_3_JUMP_GATE.md), the Jump Gate regression suite is documented in [`docs/testing/jump-gate-regression.md`](../docs/testing/jump-gate-regression.md), all child issues `P2.3-501…508` are closed or explicitly replaced, default CI passes, and the closing PR runs the `run-e2e` browser smoke gate |
| Phase 3 ready | Two-player visibility model is proven, alliance membership works, and combat child tasks `P3-COM-001…013` have evidence for server-authoritative battle, bombing, shields, refuel support, advanced resources, atomic power, UI, and regression coverage |
| Launch ready | Staging deploy/rollback succeeds, backups restore, monitoring alerts fire, security checklist passes |
| Live ops ready | Event framework works, content validation exists, balance review loop and support runbook are usable |

## Phase 2.1 gameplay rollup gate (P2.1-400)

Roll-up issue: [`P2.1-400`](https://github.com/anry88/New-Universe/issues/200). Evidence for dependency closure, child issue closure, automated verification, and manual smoke expectations lives in [`ROADMAP_P2_1_GAMEPLAY.md`](ROADMAP_P2_1_GAMEPLAY.md).

This gate is separate from **P2-EPIC-POLISH**: Phase 2.1 verifies the corrected gameplay experience after the P1/P1.1 implementation pass, while P2 polish remains the broader balance/regression gate for Phase 2 expansion.

## Phase 2 polish epic gate (P2-EPIC-POLISH)

Roll-up issue: [`P2-EPIC-POLISH`](https://github.com/anry88/New-Universe/issues/93) (depends on **P2-POL-001**, **P2-POL-002**, **P2-POL-003**). Evidence below satisfies the epic acceptance checklist before detailed Phase 3 execution planning.

| Acceptance criterion | Evidence in repo | How to verify locally |
|----------------------|------------------|------------------------|
| P2 balance simulator produces a reviewable first-week report | [`tools/balance-sim/`](../tools/balance-sim/README.md) — `scenarios/first-week.json`, `expected-ranges.json`, generated summaries under `artifacts/` (see `.gitkeep`) | `cd tools/balance-sim && npm ci && npm run simulate && npm run verify && npm test` |
| Content audit passes against catalog and localization expectations | [`backend/src/db/seed/audit.ts`](../backend/src/db/seed/audit.ts), [`backend/src/db/seed/audit.test.ts`](../backend/src/db/seed/audit.test.ts) | `cd backend && npm test` (includes audit test) or `npx vitest run src/db/seed/audit.test.ts` |
| Phase 2 regression suite passes locally and is documented | [`backend/tests/e2e/phase2-regression.test.ts`](../backend/tests/e2e/phase2-regression.test.ts), [`docs/testing/phase2-regression.md`](../docs/testing/phase2-regression.md) | `cd backend && npx vitest run tests/e2e/phase2-regression.test.ts` |
| Known P2 tuning risks recorded before Phase 3 task breakdown | [`docs/phase2/tuning-risks.md`](../docs/phase2/tuning-risks.md) | Reviewer read-through |

**Repository-wide CI mirror (Docker):** from repo root, `./scripts/ci-verify.sh` matches [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) (backend `npm test` includes audit + all e2e tests including Phase 2 regression). **Optional browser gate for epic PR merge:** add label **`run-e2e`** and/or `RUN_PLAYWRIGHT_E2E=1 ./scripts/ci-verify.sh` per [`.github/workflows/e2e.yml`](../.github/workflows/e2e.yml).

## Phase 2.3 Jump Gate rollup gate (P2.3-500)

Roll-up issue: `P2.3-500`. Evidence for the final Jump Gate path lives in [`ROADMAP_P2_3_JUMP_GATE.md`](ROADMAP_P2_3_JUMP_GATE.md) and [`docs/testing/jump-gate-regression.md`](../docs/testing/jump-gate-regression.md).

| Acceptance criterion | Evidence in repo | How to verify locally |
|----------------------|------------------|------------------------|
| Jump Gate random and known-destination travel are server-authoritative | [`backend/tests/e2e/jump-gate-regression.test.ts`](../backend/tests/e2e/jump-gate-regression.test.ts) | `cd backend && npx vitest run tests/e2e/jump-gate-regression.test.ts` |
| Common Pool discovery, colonization, and cargo delivery work through gate routes | [`backend/tests/e2e/jump-gate-regression.test.ts`](../backend/tests/e2e/jump-gate-regression.test.ts) | `cd backend && npm run test:e2e` |
| Foreign Home Systems stay out of common/sector payloads | [`backend/tests/e2e/jump-gate-regression.test.ts`](../backend/tests/e2e/jump-gate-regression.test.ts) | `cd backend && npx vitest run tests/e2e/jump-gate-regression.test.ts` |
| Mobile Telegram Mini App smoke is documented for the roll-up PR | [`docs/testing/jump-gate-regression.md`](../docs/testing/jump-gate-regression.md) | Manual smoke with mobile viewport; closing PR must carry `run-e2e` |

## Phase 3 combat rollup gate (P3-EPIC-COMBAT)

Roll-up issue: [`P3-EPIC-COMBAT`](https://github.com/anry88/New-Universe/issues/342). The combat roadmap is split into child tasks `P3-COM-001…013` so schema/content, starter military resources, advanced Common Pool resources, atomic power, fuel/refuel, ship combat, bombing, shields, nuclear payload rules, UI, and regression evidence can ship through narrower PRs.

| Acceptance area | Child task(s) | Required evidence |
|-----------------|---------------|-------------------|
| Combat model and starter military economy | `P3-COM-001`, `P3-COM-002`, `P3-COM-003` | HP/combat catalog tests, starter resource/production audit, Weapons/Military Shipyard gate tests |
| Fleet fuel and first combat hulls | `P3-COM-004`, `P3-COM-005` | Fuel preview/refuel transfer tests, light fighter/bomber/laser build tests, localized UI smoke |
| Server-authoritative combat | `P3-COM-006`, `P3-COM-007` | Idempotent ship combat ticks, bombing ticks, building destruction order, colonization block tests |
| Advanced resources and atomic power | `P3-COM-013` | Common Pool resource generation, advanced material recipe, atomic reactor energy, content audit and balance-sim tests |
| Advanced combat lines | `P3-COM-008`, `P3-COM-009`, `P3-COM-010` | Medium/heavy hull audits, rocket-carrier tests, shield coverage/recharge tests, nuclear payload gate/restriction tests |
| Player-facing and regression gate | `P3-COM-011`, `P3-COM-012` | Mobile UI smoke, balance/regression report, `./scripts/ci-verify.sh`, and rollup PR `run-e2e` evidence |
| Combat regression suite | `P3-COM-012` | [`backend/tests/e2e/combat-regression.test.ts`](../backend/tests/e2e/combat-regression.test.ts) passes locally and validates full build-produce-fuel-fight-bomb-colonize loop |

## Phase 3 combat rollup gate (P3-EPIC-COMBAT) evidence

| Acceptance criterion | Evidence in repo | How to verify locally |
|----------------------|------------------|------------------------|
| Server-authoritative ship combat and building bombing work correctly | [`backend/tests/e2e/combat-regression.test.ts`](../backend/tests/e2e/combat-regression.test.ts) | `cd backend && npx vitest run tests/e2e/combat-regression.test.ts` |
| Fleet fuel and production prerequisites are enforced | [`backend/tests/e2e/combat-regression.test.ts`](../backend/tests/e2e/combat-regression.test.ts) (Step 1-5) | `cd backend && npx vitest run tests/e2e/combat-regression.test.ts` |
| Building destruction and planet wipe rules are stable | [`backend/tests/e2e/combat-regression.test.ts`](../backend/tests/e2e/combat-regression.test.ts) (Step 7) | `cd backend && npx vitest run tests/e2e/combat-regression.test.ts` |
| Colonization is blocked by hostile presence | [`backend/tests/e2e/combat-regression.test.ts`](../backend/tests/e2e/combat-regression.test.ts) (Step 8) | `cd backend && npx vitest run tests/e2e/combat-regression.test.ts` |

## Known Gaps After This Expansion

- P3 is still intentionally lighter than P2 and should be broken down again after Phase 2 regression is stable.
- Monetization is kept as readiness/design until analytics and security gates are in place.
- Admin UI is not fully specified yet; P5 support tasks define the runbook first.
- Deep PvP combat is now planned under `P3-EPIC-COMBAT`, but implementation remains sequenced after Jump Gate/Common Pool routing and multiplayer visibility foundations.
- Full localization pipeline is represented through content-pack validation, but not yet through translator workflow tasks.
- Jump Gate / Common Pool routing is represented as Phase 2.3 in `tasks/tasks.json` and GitHub Project #3; keep the Project cards synchronized through the idempotent import/status scripts when the roadmap changes.
