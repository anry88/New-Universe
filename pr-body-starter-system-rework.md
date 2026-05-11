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
backend/src/features/world/biomes.ts                               (orbit + size meta)
backend/src/features/world/home-system-generator.ts                (9 planets, biome-orbit)
backend/src/features/world/home-system-generator.test.ts           (new cases)
backend/src/workers/tick-expeditions.ts                            (autoColonizeAtTarget)
frontend/src/components/pixi/SystemRenderer.tsx                    (biome palette, orbit order)
```
