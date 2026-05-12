ALTER TABLE "buildings" ADD COLUMN "selected_resource_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "buildings" ADD CONSTRAINT "buildings_selected_resource_id_resources_id_fk" FOREIGN KEY ("selected_resource_id") REFERENCES "public"."resources"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "buildings" AS b
SET "selected_resource_id" = (
  SELECT r."resource_id"
  FROM "richness" AS r
  WHERE r."planet_id" = b."planet_id"
    AND r."value" > 0
    AND (
      (b."type_id" = 'mine' AND r."resource_id" IN ('iron', 'copper', 'aluminum', 'carbon', 'silicon', 'titanium', 'mercury', 'magnesium', 'lead', 'uranium', 'cobalt', 'silicon_carbide', 'iridium'))
      OR (b."type_id" = 'drill' AND r."resource_id" IN ('water', 'methane', 'ice', 'oil', 'tritium'))
      OR (b."type_id" = 'oil_pump' AND r."resource_id" = 'oil')
      OR (b."type_id" = 'biomass_harvester' AND r."resource_id" = 'biomass')
    )
  ORDER BY CASE r."resource_id"
    WHEN 'iron' THEN 1
    WHEN 'water' THEN 1
    WHEN 'oil' THEN 1
    WHEN 'biomass' THEN 1
    WHEN 'copper' THEN 2
    WHEN 'methane' THEN 2
    WHEN 'aluminum' THEN 3
    WHEN 'ice' THEN 3
    WHEN 'carbon' THEN 4
    WHEN 'tritium' THEN 4
    WHEN 'silicon' THEN 5
    ELSE 99
  END
  LIMIT 1
)
WHERE b."selected_resource_id" IS NULL
  AND b."type_id" IN ('mine', 'drill', 'oil_pump', 'biomass_harvester')
  AND EXISTS (
    SELECT 1
    FROM "richness" AS r
    WHERE r."planet_id" = b."planet_id"
      AND r."value" > 0
      AND (
        (b."type_id" = 'mine' AND r."resource_id" IN ('iron', 'copper', 'aluminum', 'carbon', 'silicon', 'titanium', 'mercury', 'magnesium', 'lead', 'uranium', 'cobalt', 'silicon_carbide', 'iridium'))
        OR (b."type_id" = 'drill' AND r."resource_id" IN ('water', 'methane', 'ice', 'oil', 'tritium'))
        OR (b."type_id" = 'oil_pump' AND r."resource_id" = 'oil')
        OR (b."type_id" = 'biomass_harvester' AND r."resource_id" = 'biomass')
      )
  );
