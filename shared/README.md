# `shared` directory

Cross-package contracts shared between the Fastify backend (`backend/`) and the React frontend (`frontend/`). Anything placed here must be safe to consume from both Node.js (ESM) and the Vite browser bundle.

## Layout

- `format/` — small pure formatters shared by API and UI where duplication would drift.
  - **`homeSystemNaming.ts`** — `homeSystemShortTag`, `sanitizePlayerSlug`, `formatPlanetCode`, `formatHomeSystemDisplayName` (EN/RU templates for home system titles and `{shortTag}-N` planet codes).
  - **`systemMapLayout.ts`** — deterministic flat home-system map layout helpers (`buildSystemMapLayouts`, `buildSystemMapOrbitGuideRadii`, `systemMapPlanetOrbitRadius`, `sectorDeltaToSystemMapPoint`, `distancePointToSegment`, `systemMapPlanetDiscoveryRadius`) shared by the frontend renderer and expedition worker so pass-by scout discovery uses the same route geometry and size-based planet footprint as the UI, with a minimum practical corridor for small worlds. Planet coordinates use stable one-planet-per-orbit slots after biome ordering, while orbit guide radii ignore obfuscated `unknown` placeholders so hidden bodies do not create artificial outer rings.

- `config/` — progression catalogs consumed by both Node and Vite bundles where duplication would drift (research gates for buildings; full tech tree).
    - **`buildingResearchGates.ts`** — `ResearchUnlockRequirement` plus `BUILDING_RESEARCH_GATES` (imported through `backend/src/config/research-unlocks.ts` on the API side and directly by Cosmic build previews). Basic `battery` / `solar_plant` energy infrastructure stays ungated at Energy level 0, while `wind_turbine` and `fuel_generator` require Energy research.
    - **`productionRecipes.ts`** — `PRODUCTION_RECIPES`, `recipesForBuildingType`, and `findProductionRecipe`; canonical manual manufacturing recipes for smelter/refinery/fabricator/cryo buildings plus fuel-generator battery charging recipes.
    - **`researchCatalog.ts`** — canonical **7×5** research tree (`RESEARCH_CATALOG`, `RESEARCH_TECH_TREE`) including the Energy branch, typed energy generation/storage/efficiency effects, and minute/hour-scale timer curves for the one-active-research queue; import via `@shared/config/researchCatalog` from backend and frontend (Docker mounts `shared/` at `/app/shared`; backend code uses `@shared`, not `../../../shared`).
    - **`tutorialRewards.ts`** — `TUTORIAL_STEP_RESOURCE_GRANTS`, `TUTORIAL_COMPLETION_RESOURCE_GRANTS`, and EN/RU UI summaries for onboarding; consumed by `features/tutorial/service.ts` and the Cosmic `Tutorial` overlay.

- `types/` — TypeScript interfaces and Zod schemas for HTTP payloads, WebSocket events, and other cross-cutting structures.
    - **`locale.ts`** — shared locale contract: `SUPPORTED_LOCALES`, `Locale`, `DEFAULT_LOCALE`, `normalizeLocale`, and request/response DTOs for `PATCH /me/preferences`.
    - **`user.ts`** — `User` interface including **`preferredLocale`**, **`diamonds`** (premium balance), `rushPricing`, `homeSystem`, and onboarding fields (`tutorialStep`, `tutorialCompletedAt`).
    - **`auth.ts`** — `AuthResponse` for the login flow.
    - **`world.ts`** — `PlanetResource`, `Building`, `BuildingEnergyState`, `PlanetEnergyStatus`, `Planet`, `HomeSystem` interfaces for world/planet state (`PlanetResource.richness` carries the deposit level exposed by `/me`, `HomeSystem.shortTag` optional wire field from `/me`, `Planet.isColonized` distinguishes discovered read-only bodies from buildable settlements, `Planet.energy` exposes battery charge/generation/consumption, and `Building.queueStartedAt` supports exact live progress).
    - **`buildings.ts`** — `BuildingType` interface (including optional catalog limits), `BuildBlockedReason` unions (including planet-resource blocks with accepted deposit ids), request/response types for construction, and **`RushBuildRequest` / `RushBuildResponse`** for `POST /buildings/rush`.
    - **`diamonds.ts`** — `RushPricing` plus `estimateRushDiamondCost`, mirroring backend rush pricing so the UI can tick countdown prices live alongside `/me` and queue **`rushPricing`** metadata (progressive curve `round((minutes^0.85) * rate)` with optional cap).
    - **`building-eligibility.ts`** — `resolveBuildBlockedReason`, `resolvePlanetResourceBlockedReason`, `resolveBuildingProducedResourceIds`, `resolveBuildingProductionRateForResource`, and `formatBuildBlockedMessage` for shared server/client validation messaging around construction gates (research → deps → per-planet/global caps → planet suitability). Optional `dependencyBuildings` narrows dependency checks when some rows are still in the initial build queue; mine producers now support local deposits from `METAL_DEPOSIT_RESOURCE_IDS` (including `carbon` and `silicon`) while extractors keep using local deposit sets and processors keep fixed outputs.
    - **`research.ts`** — `ResearchBranch`, `ResearchProgress` (including active-tier `startedAt`), `ResearchDefinition`, `StartResearchRequest` / `StartResearchResponse`, `RushResearchRequest` / `RushResearchResponse`, `ResearchRequirementRef`, localized `RESEARCH_BRANCH_LABELS` / `researchBranchLabel`, `RESEARCH_BRANCH_LABELS_EN`, and `ResourceId` union (includes gameplay resources such as `oil`, `fuel`, `steel`, `electronics`, and tiered minerals) used by the tech tree and unlock messaging on backend/frontend.
    - **`ships.ts`** — `Ship` and `ShipType` interfaces, plus ship-queue/rush payloads (`ShipQueueItem` includes `queueStartedAt`, `RushShipBuildRequest`, `RushShipBuildResponse`) used by fleet construction ETA/progress + rush flows.
    - **`expeditions.ts`** — `Expedition` and `ExpeditionResult` interfaces, including server-calculated `fuelRequired`, route `distance`, and timer fields consumed by fleet/map UI.
    - **`market.ts`** — `MarketOffer`, market-order request/response payloads, and side/status primitives shared by market frontend hooks and backend routes.
    - **`multiplayer.ts`** — `PresenceEntityKind`, `SectorPresenceEntity`, and `SectorPresencePayload` for the sector-map presence API (`GET /multiplayer/sectors/:sx/:sy/:sz/presence`).
    - **`production.ts`** — production recipe summaries, preview/start payloads, structured block reasons, and production-order DTOs shared by `/resources/production/*` and the frontend production dialog.


## Conventions

- Use plain `.ts` modules with named exports. Do not import Node-only or DOM-only APIs from this folder.
- When you add a new contract, prefer Zod schemas plus `z.infer<typeof schema>` so both sides validate identical shapes at runtime when needed.
- The backend mounts this directory at `/app/shared` inside Docker (`docker-compose.yml`), so backend imports look like `../../../shared/types/<file>.js`. Both backend and frontend now support the `@shared` alias, which resolves to `shared/` in Docker and `../shared/` locally.
- Use `@shared/types/<file>.js` in the backend and `@shared/types/<file>` (or with `.js`) in the frontend.
- Update [`DOCUMENTATION.md`](../DOCUMENTATION.md) and the affected package READMEs whenever you publish a new shared type.
