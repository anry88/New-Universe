# `shared` directory

Cross-package contracts shared between the Fastify backend (`backend/`) and the React frontend (`frontend/`). Anything placed here must be safe to consume from both Node.js (ESM) and the Vite browser bundle.

## Layout

- `config/` — progression catalogs consumed by both Node and Vite bundles where duplication would drift (research gates for buildings).
    - **`buildingResearchGates.ts`** — `ResearchUnlockRequirement` plus `BUILDING_RESEARCH_GATES` (imported through `backend/src/config/research-unlocks.ts` on the API side and directly by Cosmic build previews).

- `types/` — TypeScript interfaces and Zod schemas for HTTP payloads, WebSocket events, and other cross-cutting structures.
    - **`user.ts`** — `User` interface including `homeSystem` and onboarding fields (`tutorialStep`, `tutorialCompletedAt`).
    - **`auth.ts`** — `AuthResponse` for the login flow.
    - **`world.ts`** — `PlanetResource`, `Building`, `Planet`, `HomeSystem` interfaces for world/planet state.
    - **`buildings.ts`** — `BuildingType` interface (including optional catalog limits), `BuildBlockedReason` unions, and request/response types for construction.
    - **`building-eligibility.ts`** — `resolveBuildBlockedReason` and `formatBuildBlockedMessage` for shared server/client validation messaging around construction gates (research → deps → per-planet/global caps).
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
