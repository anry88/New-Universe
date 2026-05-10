# Known Phase 2 tuning risks (pre–Phase 3 breakdown)

Living checklist recorded for epic **[P2-EPIC-POLISH](https://github.com/anry88/New-Universe/issues/93)**. These are **accepted gaps** or **watch items**, not blockers for opening detailed Phase 3 tasks, unless an item is promoted into a dedicated issue.

| Risk | Why it matters | Mitigation / follow-up |
|------|----------------|-------------------------|
| **NPC market depth is synthetic** | Tier-based depth in `orders.ts` may not match live retention-driven liquidity. | Tune `marketDepthByTier` with analytics once Phase 3 traffic exists; balance-sim scenarios already stress NPC trade chunks. |
| **Cargo vs worker timing** | Cargo expeditions rely on Redis/BullMQ delays; dev Redis may warn `noeviction` — production must use `noeviction` or bounded queues. | Ops Redis policy + cargo-route worker idempotency tests; regression suite asserts planet debits only once. |
| **Colonization distance / cooldown** | `COLONIZATION_RULES` caps (`maxDistance`, `cooldownSec`) strongly shape expansion pacing; too tight feels punitive, too loose skips logistics fantasy. | Review after simulator first-week reports and live funnel; constants live in `backend/src/config/colonization-rules.ts`. |
| **Research ↔ building gates drift** | Content audit validates catalog IDs and costs, not runtime gate parity with UI copy. | Keep `research-unlocks.ts` and seed audit in the same PR when gates move; P3 tasks assume regression green. |
| **Simulator ≠ server tick-for-tick** | `tools/balance-sim` mirrors catalog math but not worker jitter, notification cadence, or concurrent players. | Treat simulator outputs as **comparison artifacts**, not SLA proofs; use Phase 2 regression for integration truth. |
| **Localization beyond catalogs** | Audit covers seeded ru/en names for catalogs; dynamic tutorial strings or bot copy may still drift. | P1.1 / content-pack pipeline tasks; spot-check during QA passes. |

See also: [`tasks/ROADMAP_COVERAGE_MATRIX.md`](../../tasks/ROADMAP_COVERAGE_MATRIX.md) (gates), [`docs/testing/phase2-regression.md`](../testing/phase2-regression.md) (integration suite).
