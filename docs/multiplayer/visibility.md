# Sector map visibility

Multiplayer sector presence is computed server-side in `backend/src/features/multiplayer/presence.ts` and exposed at `GET /multiplayer/sectors/:sx/:sy/:sz/presence`.

## Rules

1. **Foreign home systems** — If `systems.is_home` is true and `systems.owner_id` is another player, the entire star system is **omitted** from the payload. Names, coordinates, and nested planets/ships in that home bubble never appear on another client's sector map (mirrors expedition discovery rules in `features/world/visibility.ts`).
2. **Neutral systems** — Systems with `owner_id IS NULL` appear as `neutral_system` markers with summary visibility (public names only).
3. **Own home** — The viewer's home system in the requested sector appears as `own_home_system` with full visibility.
4. **Colonies** — Off-world colonies appear as `own_colony` or `foreign_colony`. Foreign colonies never expose another player's planet title as authoritative identity; the UI shows a generic label plus a masked handle derived from Telegram username/first name.
5. **Idle ships** — Ships docked at a planet (`status = idle`) appear as `own_ship` / `foreign_ship`. Cargo JSON is not exposed on this endpoint.

## Client expectations

The Telegram Mini App should treat every entity with `visibility: "summary"` as **untrusted decoration**: no automation or combat logic should rely on subtitles or titles for foreign actors.
