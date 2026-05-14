CREATE INDEX IF NOT EXISTS "expeditions_origin_planet_status_idx" ON "expeditions" USING btree ("origin_planet_id","status");
CREATE INDEX IF NOT EXISTS "expeditions_target_planet_status_idx" ON "expeditions" USING btree ("target_planet_id","status");
