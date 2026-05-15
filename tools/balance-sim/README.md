# `tools/balance-sim` directory

Deterministic offline simulator for first-week economy progression (resources, buildings, research tiers, ship construction). This is a **design safety tool**: it does **not** import the backend and runs without Postgres, Redis, or Docker.

## Layout

- **`package.json`** — local scripts (`npm run simulate`, `npm test`).
- **`scenarios/first-week.json`** — beginner vs optimized fixture definitions for local production and expansion pacing.
- **`expected-ranges.json`** — inclusive milestone bands validated by tests / `npm run verify`.
- **`artifacts/`** — generated JSON summaries (`artifacts/latest-summary.json` last run pointer). Ignored by git except `.gitkeep`.
- **`src/catalog.ts`** — numeric mirrors of backend seeds/config (keep synchronized when balance changes). Includes **`HOME_SYSTEM_BASE_BIOME_IDS`** / fixed **`HOME_SYSTEM_PLANET_COUNT_* = 8`** aligned with `backend/src/features/world/biomes.ts` and `home-system-generator.ts`, plus the shared 50-unit Jump Fuel gate cost and refinery `jump_fuel_from_ice_tritium` recipe. Passive producers (`mine`, `drill`, `oil_pump`, `biomass_harvester`) mirror shared per-resource extraction rates and extractor roles (metals, gases, oil/methane, water/biomass), every building row mirrors the shared **L10** cap, shipyard and military-shipyard unlocks mirror backend dependencies, energy infrastructure (`battery`, `solar_plant`, `wind_turbine`, `fuel_generator`) mirrors storage/generation/charge recipes, ship construction mirrors catalog gates such as `cargo_light` requiring shipyard L2, Logistics L1, and capital-planet resources plus medium/heavy combat, shield, and rocket-carrier hulls requiring advanced Common Pool materials with Weapons/Energy gates, Energy research tiers mirror the shared catalog for early simulation, while processors (`smelter`, `refinery`, `fabrication_bay`, `cryo_factory`) list manual `recipes` and independent Command Center gates rather than depending on each other.
- **`src/simulate.ts`** — discrete-time integrator for extractor production, queued structures, research, and ship construction. It applies passive generation only for extractor-style buildings; crafted resources are modeled through explicit scenario actions/recipes rather than automatic processor output, while the summary note calls out mirrored stored Jump Fuel recipe/cost constants. Building upgrades use shared L10 / Command Center cap checks and the shared L6+ extra-cost helper.
- **`src/cli.ts`** — loads a scenario file, writes artifacts, optional `--verify`.

## Upgrade time & cost curve

The simulator mirrors backend building upgrades:

- Upgrade from level **L** → **L+1**: resource cost scales by **1.6^L** (per resource, rounded); build time scales by **1.8^L** × `baseTimeSec`, then research modifiers from `src/effects.ts`.
- Upgrades targeting **level 6+** add the shared high-tier material kit for that building (for example ship infrastructure uses steel/titanium/aluminum, not biomass).
- Non-Command-Center buildings cannot upgrade beyond the completed Command Center level on that planet; all building types cap at **L10**.
- Command Center `baseTimeSec` and `baseCost` match seeds (`catalog.ts`); genesis home capital starts with a completed CC (see `home-system-generator`), and colonizer settlement creates the first completed CC on the target planet. Later CC upgrades spend the same basic resources as the backend (`iron`, `carbon`, `silicon`) through the normal **1.6^L** cost curve.

## Sync contract

When you change production economics in the live game, update **`src/catalog.ts`** / **`src/simulate.ts`** (and scenario labels if intent shifts). Keep local simulator constants aligned with `shared/config/`; the simulator runs as a standalone package and mirrors those values explicitly. Document each adjustment in the PR that touches backend seeds or `colonization-rules`.

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
