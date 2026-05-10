# `tools/balance-sim` directory

Deterministic offline simulator for first-week economy progression (resources, buildings, research tiers, NPC settlement trades, ship construction). This is a **design safety tool**: it does **not** import the backend and runs without Postgres, Redis, or Docker.

## Layout

- **`package.json`** — local scripts (`npm run simulate`, `npm test`).
- **`scenarios/first-week.json`** — beginner vs optimized fixture definitions (`marketChunks` expands into granular NPC trades).
- **`expected-ranges.json`** — inclusive milestone bands validated by tests / `npm run verify`.
- **`artifacts/`** — generated JSON summaries (`artifacts/latest-summary.json` last run pointer). Ignored by git except `.gitkeep`.
- **`src/catalog.ts`** — numeric mirrors of backend seeds/config (keep synchronized when balance changes). Includes **`HOME_SYSTEM_BASE_BIOME_IDS`** / **`HOME_SYSTEM_PLANET_COUNT_*`** aligned with `backend/src/features/world/biomes.ts` and `home-system-generator.ts`.
- **`src/simulate.ts`** — discrete-time integrator with parallel NPC trade resolution (no single serial trade blocks unrelated fills).
- **`src/cli.ts`** — loads a scenario file, writes artifacts, optional `--verify`.

## Sync contract

When you change production economics in the live game, update **`src/catalog.ts`** (and scenario labels if intent shifts). Document each adjustment in the PR that touches backend seeds or `colonization-rules`.

## Verification

```bash
cd tools/balance-sim
npm install
npm run simulate
npm run verify
npm test
```

The CI mirror for the whole repo remains `./scripts/ci-verify.sh`; this package is invoked manually or via future workflow hooks.

## Epic P2-EPIC-POLISH gate

Roll-up issue [`P2-EPIC-POLISH`](https://github.com/anry88/New-Universe/issues/93) requires a reviewable first-week report from this simulator. Evidence commands and cross-links to the seed audit and Phase 2 regression suite are recorded in [`tasks/ROADMAP_COVERAGE_MATRIX.md`](../../tasks/ROADMAP_COVERAGE_MATRIX.md) (section **Phase 2 polish epic gate**).
