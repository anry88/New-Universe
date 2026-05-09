# `backend/src/config` directory

Static tuning constants for backend subsystems.

## Files

- **`market-prices.ts`** — deterministic NPC pricing constants: per-tier baselines, resource baseline overrides, spread ranges, stock-pressure clamps, and pricing model version.

## Conventions

- Keep values deterministic and pure (no runtime I/O in this directory).
- Treat these constants as gameplay knobs for balancing passes.
