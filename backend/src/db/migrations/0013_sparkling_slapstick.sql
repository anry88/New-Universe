ALTER TABLE "expeditions" DROP CONSTRAINT "expeditions_ship_id_ships_id_fk";
--> statement-breakpoint
ALTER TABLE "expeditions" DROP CONSTRAINT "expeditions_origin_planet_id_planets_id_fk";
--> statement-breakpoint
ALTER TABLE "expeditions" DROP CONSTRAINT "expeditions_target_planet_id_planets_id_fk";
--> statement-breakpoint
ALTER TABLE "research_progress" DROP CONSTRAINT "research_progress_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "pending" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "sent_at" timestamp;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expeditions" ADD CONSTRAINT "expeditions_ship_id_ships_id_fk" FOREIGN KEY ("ship_id") REFERENCES "public"."ships"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expeditions" ADD CONSTRAINT "expeditions_origin_planet_id_planets_id_fk" FOREIGN KEY ("origin_planet_id") REFERENCES "public"."planets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "expeditions" ADD CONSTRAINT "expeditions_target_planet_id_planets_id_fk" FOREIGN KEY ("target_planet_id") REFERENCES "public"."planets"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "research_progress" ADD CONSTRAINT "research_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
