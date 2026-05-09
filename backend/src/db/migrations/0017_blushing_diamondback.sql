ALTER TABLE "colonies" DROP CONSTRAINT "colonies_owner_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "colonies" DROP CONSTRAINT "colonies_planet_id_planets_id_fk";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "colonies" ADD CONSTRAINT "colonies_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "colonies" ADD CONSTRAINT "colonies_planet_id_planets_id_fk" FOREIGN KEY ("planet_id") REFERENCES "public"."planets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
