# `backend/src/features/multiplayer` directory

Sector-scale multiplayer visibility — projects what another player may learn about systems/colonies/fleets in a shared `(sectorX, sectorY, sectorZ)` cube without leaking foreign home systems.

## Files

- **`presence.ts`** — exports `getSectorPresence(viewerId, sectorX, sectorY, sectorZ)` returning `SectorPresencePayload` and `getSectorSystemAnchors(viewerId)` returning `SectorSystemAnchorsPayload` (`@shared/types/multiplayer`). Filters foreign homeworlds entirely, marks each payload with explicit home/colony/fleet/public-sector metadata, includes non-destroyed docked idle ships, non-destroyed `stationed` Jump Gate point deployments, and active `in_flight` / `returning` expedition ships as fleet markers with projected sector position, movement vector, and recent-combat timestamp, masks foreign actors via truncated Telegram handles, and feeds the frontend Sector selector with Home/discovered/colony/fleet anchors.
- **`presence.test.ts`** — Vitest checks foreign homes stay hidden, destroyed ships stay out of presence/anchor payloads, two-player sector presence distinguishes home/public/colony/fleet entities, active moving fleet markers carry motion metadata, and the system-anchor selector filters protected home systems.

## Adding visibility rules

1. Update `getSectorPresence` / `getSectorSystemAnchors` and extend [`docs/multiplayer/visibility.md`](../../../../docs/multiplayer/visibility.md).
2. Keep outputs aligned with `shared/types/multiplayer.ts` so the Telegram client stays type-safe.
