CREATE INDEX IF NOT EXISTS "buildings_planet_id_idx" ON "buildings" USING btree ("planet_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "buildings_planet_type_idx" ON "buildings" USING btree ("planet_id","type_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "buildings_planet_queue_idx" ON "buildings" USING btree ("planet_id","queue_action","queue_completes_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expeditions_ship_status_idx" ON "expeditions" USING btree ("ship_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ships_owner_status_idx" ON "ships" USING btree ("owner_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ships_location_planet_status_idx" ON "ships" USING btree ("location_planet_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ships_queue_status_idx" ON "ships" USING btree ("status","queue_completes_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "systems_owner_id_idx" ON "systems" USING btree ("owner_id");