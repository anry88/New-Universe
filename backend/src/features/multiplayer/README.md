# `backend/src/features/multiplayer` directory

Sector-scale multiplayer visibility — projects what another player may learn about systems/colonies/ships in a shared `(sectorX, sectorY, sectorZ)` cube without leaking foreign home systems.

## Files

- **`presence.ts`** — exports `getSectorPresence(viewerId, sectorX, sectorY, sectorZ)` returning `SectorPresencePayload` (`@shared/types/multiplayer`). Filters foreign homeworlds entirely; masks foreign actors via truncated Telegram handles.
- **`presence.test.ts`** — Vitest checks foreign homes stay hidden and neutral + foreign colony markers behave.

## Adding visibility rules

1. Update `getSectorPresence` and extend [`docs/multiplayer/visibility.md`](../../../../docs/multiplayer/visibility.md).
2. Keep outputs aligned with `shared/types/multiplayer.ts` so the Telegram client stays type-safe.
