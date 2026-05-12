# `tools/balance-sim` directory

Deterministic offline simulator for first-week economy progression (resources, buildings, research tiers, NPC settlement trades, ship construction). This is a **design safety tool**: it does **not** import the backend and runs without Postgres, Redis, or Docker.

## Layout

- **`package.json`** — local scripts (`npm run simulate`, `npm test`).
- **`scenarios/first-week.json`** — beginner vs optimized fixture definitions (`marketChunks` expands into granular NPC trades).
- **`expected-ranges.json`** — inclusive milestone bands validated by tests / `npm run verify`.
- **`artifacts/`** — generated JSON summaries (`artifacts/latest-summary.json` last run pointer). Ignored by git except `.gitkeep`.
- **`src/catalog.ts`** — numeric mirrors of backend seeds/config (keep synchronized when balance changes). Includes **`HOME_SYSTEM_BASE_BIOME_IDS`** / fixed **`HOME_SYSTEM_PLANET_COUNT_* = 9`** aligned with `backend/src/features/world/biomes.ts` and `home-system-generator.ts`. Passive producers (`mine`, `drill`, `oil_pump`, `biomass_harvester`) list `output`, while processors (`smelter`, `refinery`, `fabrication_bay`, `cryo_factory`) list manual `recipes`.
- **`src/simulate.ts`** — discrete-time integrator with parallel NPC trade resolution (no single serial trade blocks unrelated fills). It applies passive generation only for extractor-style buildings; crafted resources are modeled through explicit scenario actions/recipes rather than automatic processor output.
- **`src/cli.ts`** — loads a scenario file, writes artifacts, optional `--verify`.

## Upgrade time & cost curve

The simulator mirrors backend building upgrades:

- Upgrade from level **L** → **L+1**: resource cost scales by **1.6^L** (per resource, rounded); build time scales by **1.8^L** × `baseTimeSec`, then research modifiers from `src/effects.ts`.
- Command Center `baseTimeSec` and `baseCost` match seeds (`catalog.ts`); genesis home capital starts with a completed CC (see `home-system-generator`), and colonizer settlement creates the first completed CC on the target planet. Later CC upgrades spend the same basic resources as the backend (`iron`, `carbon`, `silicon`) through the normal **1.6^L** cost curve.

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
