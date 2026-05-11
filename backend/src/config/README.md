# `backend/src/config` directory

Static tuning constants for backend subsystems.

## Files

- **`colonization-rules.ts`** — typed colony caps (`maxColoniesBase` + logistics), founding resource costs, cooldown, max distance from nearest owned base, and engineering research prereq; enforced by `features/colonies/colonization-rules.ts` and surfaced to the client for blocked-state copy.
- **`colonization-rules.test.ts`** — validates cost keys, matches the same cap formula as `checkColonizationGates`, and gates epic **P2-EPIC-COLONIZE** (≥2 off-world colonies at logistics level 1, ≥3 at level 2).
- **`colony-bootstrap.ts`** — one-time starting stock granted when a colonizer founds a colony. It no longer configures passive regen; new colonies keep `planet_resources.regenRate = 0` until extractor buildings complete.
- **`market-prices.ts`** — deterministic NPC pricing constants: per-tier baselines, resource baseline overrides, spread ranges, stock-pressure clamps, and pricing model version.
- **`market-prices.test.ts`** — asserts baseline keys stay aligned with seeded resource tiers and gates epic **P2-EPIC-MARKET-NPC** (no instant NPC arbitrage loop at neutral stock; spreads defined for tiers 1–4).
- **`research-catalog.ts`** — Phase 2 research catalog: thin re-export of **`shared/config/researchCatalog.ts`** (seven branches × **five** tiers). Localized names/descriptions, costs/time scaling, typed effect modifiers, flattened `RESEARCH_TECH_TREE` consumed by research routes/effects/seeding.
- **`research-unlocks.ts`** — maps gated actions (specific buildings, hulls, colonization, cargo transfers, NPC market orders, jump drive) to minimum completed `{ branch, level }` pairs; enforced by `features/research/gates.ts`.
- **`research-catalog.test.ts`** — validates catalog structure guarantees: **35** nodes (levels `1..5` per branch), monotonic cost/time scaling vs documented minimum ratios (integer slack), localized copy, effects sanity, and `getResearchDef(..., 6)` undefined (epic **P2-EPIC-RESEARCH** gate). Run via `npm run research:catalog-check`.

## Conventions

- Keep values deterministic and pure (no runtime I/O in this directory).
- Treat these constants as gameplay knobs for balancing passes.
