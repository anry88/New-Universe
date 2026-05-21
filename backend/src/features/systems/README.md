# `backend/src/features/systems` directory

System-scoped read models live here. These endpoints answer questions about one concrete system and avoid reusing broader discovery or Jump Gate state for live tactical UI.

## Files

- **`routes.ts`** — `systemsRoutes(app)` registers authenticated `GET /systems/:systemId/tactical-state`. The route requires a JWT session, validates the `systemId` param, and returns `404` when the system is not visible to the viewer.
- **`tactical-state.ts`** — exports `getSystemTacticalState(userId, systemId)`. It allows the viewer's own systems, discovered public systems, systems with the viewer's colony, docked ships, or active tactical ships, while keeping foreign Home Systems hidden. It returns the requested system's Jump Gate fleet contacts in `in_flight` / `returning` / `stationed` states with viewer-relative `self`/`foreign` relation, full own visibility including fuel/support-fuel tank values, redacted foreign owner aliases, visible hull type, current HP, combat stats, recent-combat timestamp, status, a system-map point interpolated for moving same-system routes, and an optional motion vector for map heading.
- **`tactical-state.test.ts`** — Vitest coverage for single-system tactical contact projection, self/foreign contact snapshots including own fuel visibility, moving point-to-point contacts with motion vectors, and undiscovered public-system protection.

## Adding System Behavior

1. Keep APIs scoped to one `systemId` unless the feature is explicitly a sector/galaxy query.
2. Keep foreign Home System privacy checks before any tactical payload is assembled.
3. Put shared response contracts in `shared/types/` and update this README plus the parent feature README when adding fields.
