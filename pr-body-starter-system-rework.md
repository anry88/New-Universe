# feat(P3): rework starter system — 9 biome-orbit planets, colonizer→CC, fix mine/drill duplicate

Branch: `feat/P3-EPIC-STARTER-SYSTEM-REWORK`

## Summary

Full rebuild of the starter system and the colonization pipeline. Player
progression no longer requires the market: every starter system contains
enough resources to bootstrap through the colonizer and into jump-capable
exploration.

Game is still pre-prod, so no data-migration is shipped — recreate the
Postgres container (`docker compose down -v && docker compose up -d`) to
get the new world from a clean slate.

## What changes

### Starter system (9 planets in biome-orbit order)
- Exactly 9 planets, placed inner → outer by biome:
  `volcanic, volcanic, rocky, rocky, green (capital), ocean, gas_giant, ice, ice`.
- New `BIOME_ORBIT_TIER`, `BIOME_SIZE_CLASS`, `PLANET_SIZE_RANGE`
  constants in `backend/src/features/world/biomes.ts`.
- Planet sizes are biome-driven and visibly different in the renderer:
  gas giants ~30–42, ice ~22–30, green ~16–22, rocky/volcanic ~6–16.
- `frontend/src/components/pixi/SystemRenderer.tsx` now tints orbit
  lines per biome, draws halos, and sorts planets by orbit tier.

### Mine vs Drill duplicate fixed (semantic split)
- `mine` → **Metals Mine** (iron/copper family). Cost `{iron, carbon}`,
  300 s build.
- `drill` → **Fluid Extractor** (water/methane/oil). Cost
  `{silicon, carbon}`, 360 s build, depends on `solar_plant L1`.
- They are no longer the same building with a swapped output resource —
  different costs, different deps, different role.

### Self-sufficient development (no market needed)
- Gas giants now spawn `tritium` as a rare resource, and the
  home-system forbidden list drops `tritium` so `jump_ship` can be built
  within the starter system without trading.
- Capital planet starting stock tuned (`iron 800, silicon 600,
  carbon 500, water 400, methane 200, oil 100, biomass 50`) to bootstrap
  mine + drill + solar + smelter + shipyard + colonizer without buying
  anything.

### Discovery ≠ colonization
- A discovered planet is read-only until a colonizer arrives.
- On colonizer arrival the ship is consumed and a level-1
  `command_center` is created **instantly at slot 0** — no queue, no
  founding cost. The expedition completes (no return trip).
- `foundColony` is now a single in-transaction path with no resource
  deduction; auto-colonization on arrival lives in the expeditions
  worker (`handleArrivalAtTarget` + `autoColonizeAtTarget`).

### Bug fixes shipped together
- **`fabrication_bay` was displayed as "Mine"** in the planet view.
  Root cause: the icon/label registry in
  `frontend/src/components/cosmic/buildings.tsx` had no entry for
  `fabrication_bay`, and `resolveBuildingType` silently fell back to
  the Mine entry. Added a proper icon, a registry entry, and changed
  the fallback to render a placeholder (with a console warning) so
  unknown ids cannot impersonate real buildings again.
- **Research gate "Lab level N required" mis-fired** when the user did
  have a built lab. Root cause: the route ran a per-planet lookup for
  the lab, but Postgres returns related planets in random UUID order so
  `meData.homeSystem.planets[0]` (the planetId the frontend sent) was
  often not the planet with the lab. Two fixes:
    - `/me` now returns `planets` sorted by `name` ASC, so the capital
      (`<tag>-1`) is always at index 0.
    - The research lab check now scans **all** of the user's planets
      (`lab` is `maxGlobal: 1` anyway) and ignores queued/upgrading
      rows via `queueAction IS NULL`.

### Capital insertion order
The generator now inserts the capital (green) **first** so name suffix
`-1` is always the capital. The remaining 8 planets are inserted in
biome-orbit order (`volcanic, volcanic, rocky, rocky, ocean, gas_giant,
ice, ice`). This keeps every call site that picks "the home planet by
first slot" working, while the frontend renderer continues to sort
planets visually by orbit tier.

## Roll-out

No migration. Drop the Postgres volume and restart:

```
docker compose down -v
docker compose up -d
```

The next login regenerates each player's home system through
`generateHomeSystem`.

## Tests

- `home-system-generator.test.ts`: updated capital-index helper, added
  four new cases (planet count = 9, biome-orbit order,
  tritium self-sufficiency, biome-driven size spread).
- `found-colony.test.ts`: expects an instantly-completed
  `command_center` (`queueAction` / `queueCompletesAt` null).
- Backend + frontend TS compile cleanly (`tsc --noEmit`, exit 0).
- Vitest could not be run inside the dev sandbox due to a
  `@rollup/rollup-linux-arm64-gnu` optional-deps issue with the local
  `node_modules` layout — please run `npm test` on the host before
  merging.

## Files

```
backend/src/db/seed/catalog-rows.ts                                (mine/drill split)
backend/src/features/colonies/found-colony.ts                      (instant CC, no cost)
backend/src/features/colonies/found-colony.test.ts                 (test sync)
backend/src/features/me/routes.ts                                  (planets ordered by name)
backend/src/features/research/routes.ts                            (global lab gate)
backend/src/features/world/biomes.ts                               (orbit + size meta)
backend/src/features/world/home-system-generator.ts                (9 planets, capital first)
backend/src/features/world/home-system-generator.test.ts           (new cases)
backend/src/workers/tick-expeditions.ts                            (autoColonizeAtTarget)
frontend/src/components/cosmic/buildings.tsx                       (fabrication_bay icon, safe fallback)
frontend/src/components/pixi/SystemRenderer.tsx                    (biome palette, orbit order)
backend/tests/e2e/first-day.test.ts                                (orderBy fix)
backend/src/features/buildings/{service,upgrade}.test.ts           (orderBy fix)
backend/src/features/colonies/{colonies,found-colony}.test.ts      (orderBy fix)
backend/src/features/expeditions/launch.test.ts                    (orderBy fix)
backend/src/features/logistics/cargo-transfer.test.ts              (orderBy fix)
backend/src/features/market/{orders,fulfillment}.test.ts           (orderBy fix)
backend/src/features/research/research.test.ts                     (orderBy fix)
backend/src/features/resources/convert.test.ts                     (orderBy fix)
backend/src/features/ships/build.test.ts                           (orderBy fix)
backend/src/workers/{tick-ships,tick-buildings}.test.ts            (orderBy fix)
```
