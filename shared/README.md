# `shared` directory

Cross-package contracts shared between the Fastify backend (`backend/`) and the React frontend (`frontend/`). Anything placed here must be safe to consume from both Node.js (ESM) and the Vite browser bundle.

## Layout

- `format/` — small pure formatters shared by API and UI where duplication would drift.
  - **`homeSystemNaming.ts`** — `homeSystemShortTag`, `sanitizePlayerSlug`, `formatPlanetCode`, `formatHomeSystemDisplayName` (EN/RU templates for home system titles and `{shortTag}-N` planet codes).

- `config/` — progression catalogs consumed by both Node and Vite bundles where duplication would drift (research gates for buildings; full tech tree).
    - **`buildingResearchGates.ts`** — `ResearchUnlockRequirement` plus `BUILDING_RESEARCH_GATES` (imported through `backend/src/config/research-unlocks.ts` on the API side and directly by Cosmic build previews).
    - **`researchCatalog.ts`** — canonical **7×5** research tree (`RESEARCH_CATALOG`, `RESEARCH_TECH_TREE`); import via `@shared/config/researchCatalog` from backend and frontend (Docker mounts `shared/` at `/app/shared`; backend code uses `@shared`, not `../../../shared`).
    - **`tutorialRewards.ts`** — `TUTORIAL_STEP_RESOURCE_GRANTS`, `TUTORIAL_COMPLETION_RESOURCE_GRANTS`, and English UI summaries for onboarding; consumed by `features/tutorial/service.ts` and the Cosmic `Tutorial` overlay.

- `types/` — TypeScript interfaces and Zod schemas for HTTP payloads, WebSocket events, and other cross-cutting structures.
    - **`user.ts`** — `User` interface including **`diamonds`** (premium balance), `homeSystem`, and onboarding fields (`tutorialStep`, `tutorialCompletedAt`).
    - **`auth.ts`** — `AuthResponse` for the login flow.
    - **`world.ts`** — `PlanetResource`, `Building`, `Planet`, `HomeSystem` interfaces for world/planet state (`HomeSystem.shortTag` optional wire field from `/me`).
    - **`buildings.ts`** — `BuildingType` interface (including optional catalog limits), `BuildBlockedReason` unions, request/response types for construction, and **`RushBuildRequest` / `RushBuildResponse`** for `POST /buildings/rush`.
    - **`diamonds.ts`** — `estimateRushDiamondCost` mirrors backend rush pricing so the UI can tick countdown prices live alongside `GET /buildings/queue` **`rushPricing`** metadata.
    - **`building-eligibility.ts`** — `resolveBuildBlockedReason` and `formatBuildBlockedMessage` for shared server/client validation messaging around construction gates (research → deps → per-planet/global caps). Optional `dependencyBuildings` narrows dependency checks when some rows are still in the initial build queue.
    - **`research.ts`** — `ResearchBranch`, `ResearchProgress`, `ResearchDefinition`, `ResearchRequirementRef`, `RESEARCH_BRANCH_LABELS_EN`, and `ResourceId` union (includes gameplay resources such as `fuel`, `steel`, `electronics`, and tiered minerals) used by the tech tree and unlock messaging on backend/frontend.
    - **`ships.ts`** — `Ship` and `ShipType` interfaces.
    - **`expeditions.ts`** — `Expedition` interface.
    - **`market.ts`** — `MarketOffer`, market-order request/response payloads, and side/status primitives shared by market frontend hooks and backend routes.
    - **`multiplayer.ts`** — `PresenceEntityKind`, `SectorPresenceEntity`, and `SectorPresencePayload` for the sector-map presence API (`GET /multiplayer/sectors/:sx/:sy/:sz/presence`).


## Conventions

- Use plain `.ts` modules with named exports. Do not import Node-only or DOM-only APIs from this folder.
- When you add a new contract, prefer Zod schemas plus `z.infer<typeof schema>` so both sides validate identical shapes at runtime when needed.
- The backend mounts this directory at `/app/shared` inside Docker (`docker-compose.yml`), so backend imports look like `../../../shared/types/<file>.js`. Both backend and frontend now support the `@shared` alias, which resolves to `shared/` in Docker and `../shared/` locally.
- Use `@shared/types/<file>.js` in the backend and `@shared/types/<file>` (or with `.js`) in the frontend.
- Update [`DOCUMENTATION.md`](../DOCUMENTATION.md) and the affected package READMEs whenever you publish a new shared type.
