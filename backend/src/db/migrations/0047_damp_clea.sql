ALTER TABLE "planets" ADD COLUMN "orbit_index" integer;--> statement-breakpoint
WITH parsed_planets AS (
  SELECT
    p."id",
    p."system_id",
    p."biome",
    s."is_home",
    CASE
      WHEN p."rename_count" = 0 AND p."name" ~ '-[0-9]+$'
        THEN substring(p."name" from '-([0-9]+)$')::integer
      ELSE NULL
    END AS name_index,
    (row_number() OVER (PARTITION BY p."system_id", p."biome" ORDER BY p."id"))::integer AS biome_rank,
    (row_number() OVER (PARTITION BY p."system_id" ORDER BY p."id"))::integer AS system_rank
  FROM "planets" p
  INNER JOIN "systems" s ON s."id" = p."system_id"
)
UPDATE "planets" p
SET "orbit_index" = CASE
  WHEN parsed."is_home" AND parsed."name_index" = 1 AND parsed."biome" = 'green' THEN 6
  WHEN parsed."is_home" AND parsed."name_index" BETWEEN 2 AND 6 THEN parsed."name_index" - 1
  WHEN parsed."is_home" AND parsed."name_index" BETWEEN 7 AND 8 THEN parsed."name_index"
  WHEN parsed."name_index" IS NOT NULL THEN parsed."name_index"
  WHEN parsed."is_home" AND parsed."biome" = 'volcanic' THEN parsed."biome_rank"
  WHEN parsed."is_home" AND parsed."biome" = 'rocky' THEN 2 + parsed."biome_rank"
  WHEN parsed."is_home" AND parsed."biome" = 'ocean' THEN 5
  WHEN parsed."is_home" AND parsed."biome" = 'green' THEN 6
  WHEN parsed."is_home" AND parsed."biome" = 'gas_giant' THEN 7
  WHEN parsed."is_home" AND parsed."biome" = 'ice' THEN 8
  ELSE parsed."system_rank"
END
FROM parsed_planets parsed
WHERE p."id" = parsed."id";
