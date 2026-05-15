# `backend/src/config` directory

Static tuning constants for backend subsystems.

## Files

- **`colonization-rules.ts`** — typed colony caps (`maxColoniesBase` + `5` colony slots per Logistics level via `maxColoniesForLogisticsLevel`), founding resource costs, cooldown, max distance from nearest owned base, and engineering research prereq; enforced by `features/colonies/colonization-rules.ts` and surfaced to the client for blocked-state copy.
- **`colonization-rules.test.ts`** — validates cost keys, matches the same cap formula as `checkColonizationGates`, and gates epic **P2-EPIC-COLONIZE** (≥6 off-world colonies at Logistics level 1, ≥11 at level 2).
- **`colony-bootstrap.ts`** — one-time starting stock granted when a colonizer founds a colony. It no longer configures passive regen; new colonies keep `planet_resources.regenRate = 0` until extractor buildings complete.
- **`research-catalog.ts`** — Phase 2 research catalog: runtime-compatible backend wrapper around **`shared/config/researchCatalog.ts`** (eight branches × **five** tiers, including Energy and Weapons). Localized names/descriptions, costs/time scaling, typed effect modifiers, one-slot queue timer curves (10 minutes through 72 hours), and flattened `RESEARCH_TECH_TREE` consumed by research routes/effects/seeding. Energy tiers modify generation, battery capacity, and energy demand on the backend.
- **`research-unlocks.ts`** — maps gated actions (specific buildings, advanced energy generators including `atomic_reactor`, ship hulls, colonization, cargo transfers, jump drive, late-tier nuclear payload use) to minimum completed `{ branch, level }` pairs; enforced by `features/research/gates.ts`. Ship hull gates are mirrored from `shared/config/shipResearchGates.ts`, so the lightweight transporter requires both shipyard L2 and Logistics L1 before construction, medium/heavy combat lines advance through Weapons III/IV, heavy rocket carriers require Weapons V, nuclear payload use requires Weapons V, and cargo-transfer usage also requires Logistics research for server-authoritative validation.
- **`research-catalog.test.ts`** — validates catalog structure guarantees (levels `1..5` per branch), monotonic cost/time scaling vs documented minimum ratios (integer slack), P2.2 minute/hour timer floors, localized copy, effects sanity, and `getResearchDef(..., 6)` undefined (epic **P2-EPIC-RESEARCH** gate). Run via `npm run research:catalog-check`.

## Conventions

- Keep values deterministic and pure (no runtime I/O in this directory).
- Treat these constants as gameplay knobs for balancing passes.
