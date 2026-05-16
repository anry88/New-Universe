-- Issue #392 cleanup: the kinetic Fighter / Cruiser / Battleship trio duplicated
-- the Light/Medium/Heavy weight-class lineage. The active military tree drops
-- these three rows; this one-shot data migration removes any orphaned rows so
-- the /ships/types endpoint stops returning them. `ships.type_id` has no cascade
-- so we delete the ship rows first (which cascades into `expeditions` via the
-- existing FK), then the parent `ship_types` rows.
DELETE FROM "ships" WHERE "type_id" IN ('fighter', 'cruiser', 'battleship');--> statement-breakpoint
DELETE FROM "ship_types" WHERE "id" IN ('fighter', 'cruiser', 'battleship');
