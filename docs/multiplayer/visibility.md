# Sector map visibility

Multiplayer sector presence is computed server-side in `backend/src/features/multiplayer/presence.ts` and exposed through two endpoints:

- `GET /multiplayer/systems` — returns the viewer's system anchors for the Sector button/selector.
- `GET /multiplayer/sectors/:sx/:sy/:sz/presence` — returns anonymized markers for one sector cube.

The persistence model deliberately reuses `systems`, `discovered_systems`, `planets`, `colonies`, `ships`, and `users`; `backend/src/db/schema/multiplayer.ts` documents the Phase 3 projection model and does not add a duplicate presence table.

## Rules

1. **Foreign home systems** — If `systems.is_home` is true and `systems.owner_id` is another player, the entire star system is **omitted** from the payload. Names, coordinates, and nested planets/ships in that home bubble never appear on another client's sector map (mirrors expedition discovery rules in `features/world/visibility.ts`).
2. **Neutral systems** — Systems with `owner_id IS NULL` appear as `neutral_system` markers with summary visibility (public names only).
3. **Own home** — The viewer's home system in the requested sector appears as `own_home_system` with full visibility.
4. **Colonies** — Off-world colonies appear as `own_colony` or `foreign_colony`. Foreign colonies never expose another player's planet title as authoritative identity; the UI shows a generic label plus a masked handle derived from Telegram username/first name.
5. **Idle ships** — Ships docked at a planet (`status = idle`) appear as `own_ship` / `foreign_ship`. Cargo JSON is not exposed on this endpoint.

Every presence entity also carries an explicit model classification:

| `entityType` | `relation` values | Source |
|---|---|---|
| `home` | `self` | Viewer-owned `systems.is_home` rows only. |
| `colony` | `self`, `foreign` | Active `colonies` joined through their planet/system. |
| `fleet` | `self`, `foreign` | Idle docked `ships` joined through their planet/system. |
| `public_sector` | `public` | Neutral/common `systems.owner_id IS NULL` rows. |

## Sector selector

`GET /multiplayer/systems` powers the Sector button flow. It returns systems the viewer can use as map anchors:

1. The viewer's home system.
2. Discovered non-protected systems from `discovered_systems`, with the newest five tagged as `recent`.
3. Systems containing the viewer's active colonies, even if the selector reached them through colony ownership rather than a discovery row.
4. Systems containing the viewer's docked ships.

Anchors include sector coordinates, world position, `home`/`discovered`/`recent`/`colony`/`fleet` tags, and colony/ship counts. Foreign home systems are filtered from this list as a defense-in-depth rule, even if bad historical data inserted a stale discovery row.

## Client expectations

The Telegram Mini App should treat every entity with `visibility: "summary"` as **untrusted decoration**: no automation or combat logic should rely on subtitles or titles for foreign actors.
