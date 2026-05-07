# `shared` directory

Cross-package contracts shared between the Fastify backend (`backend/`) and the React frontend (`frontend/`). Anything placed here must be safe to consume from both Node.js (ESM) and the Vite browser bundle.

## Layout

- `types/` — TypeScript interfaces and Zod schemas for HTTP payloads, WebSocket events, and other cross-cutting structures. Currently empty: add new modules as features land.

## Conventions

- Use plain `.ts` modules with named exports. Do not import Node-only or DOM-only APIs from this folder.
- When you add a new contract, prefer Zod schemas plus `z.infer<typeof schema>` so both sides validate identical shapes at runtime when needed.
- The backend mounts this directory at `/app/shared` inside Docker (`docker-compose.yml`), so backend imports look like `../../../shared/types/<file>.js`. The frontend imports use Vite path aliasing or relative paths (`../../shared/types/<file>`); decide the alias once the first contract lands and document it here.
- Update [`DOCUMENTATION.md`](../DOCUMENTATION.md) and the affected package READMEs whenever you publish a new shared type.
