# `backend/src/config` directory

Static tuning constants for backend subsystems.

## Files

- **`colonization-rules.ts`** — typed colony caps (`maxColoniesBase` + logistics), founding resource costs, cooldown, max distance from nearest owned base, and engineering research prereq; enforced by `features/colonies/colonization-rules.ts` and surfaced to the client for blocked-state copy.
- **`colonization-rules.test.ts`** — validates cost keys, matches the same cap formula as `checkColonizationGates`, and gates epic **P2-EPIC-COLONIZE** (≥2 off-world colonies at logistics level 1, ≥3 at level 2).
- **`market-prices.ts`** — deterministic NPC pricing constants: per-tier baselines, resource baseline overrides, spread ranges, stock-pressure clamps, and pricing model version.
- **`research-catalog.ts`** — Phase 2 research catalog source of truth (levels 1-3 per branch). Exports localized names/descriptions, conservative costs/time, typed effect modifiers, and a flattened `RESEARCH_TECH_TREE` consumed by research routes/effects.
- **`research-unlocks.ts`** — maps gated actions (specific buildings, hulls, colonization, cargo transfers, NPC market orders, jump drive) to minimum completed `{ branch, level }` pairs; enforced by `features/research/gates.ts`.
- **`research-catalog.test.ts`** — validates catalog structure guarantees: every branch contains levels `1..3`, localized copy is present, effect multipliers are positive where effects exist, and `getResearchDef` resolves levels `1–3` per branch (epic **P2-EPIC-RESEARCH** gate).

## Conventions

- Keep values deterministic and pure (no runtime I/O in this directory).
- Treat these constants as gameplay knobs for balancing passes.
