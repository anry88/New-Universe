# `shared` directory

Cross-package contracts shared between the Fastify backend (`backend/`) and the React frontend (`frontend/`). Anything placed here must be safe to consume from both Node.js (ESM) and the Vite browser bundle.

## Layout

- `types/` — TypeScript interfaces and Zod schemas for HTTP payloads, WebSocket events, and other cross-cutting structures.
    - **`user.ts`** — `User` interface including `homeSystem`.
    - **`auth.ts`** — `AuthResponse` for the login flow.
    - **`world.ts`** — `PlanetResource`, `Building`, `Planet`, `HomeSystem` interfaces for world/planet state.
    - **`buildings.ts`** — `BuildingType` interface and request/response types for construction.
    - **`research.ts`** — `ResearchBranch`, `ResearchProgress`, `ResearchDefinition`, and `ResourceId` union used by the tech tree on backend/frontend.
    - **`ships.ts`** — `Ship` and `ShipType` interfaces.
    - **`expeditions.ts`** — `Expedition` interface.


## Conventions

- Use plain `.ts` modules with named exports. Do not import Node-only or DOM-only APIs from this folder.
- When you add a new contract, prefer Zod schemas plus `z.infer<typeof schema>` so both sides validate identical shapes at runtime when needed.
- The backend mounts this directory at `/app/shared` inside Docker (`docker-compose.yml`), so backend imports look like `../../../shared/types/<file>.js`. Both backend and frontend now support the `@shared` alias, which resolves to `shared/` in Docker and `../shared/` locally.
- Use `@shared/types/<file>.js` in the backend and `@shared/types/<file>` (or with `.js`) in the frontend.
- Update [`DOCUMENTATION.md`](../DOCUMENTATION.md) and the affected package READMEs whenever you publish a new shared type.
