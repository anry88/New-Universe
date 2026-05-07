CREATE TABLE IF NOT EXISTS "discovered_planets" (
	"user_id" uuid NOT NULL,
	"planet_id" uuid NOT NULL,
	"discovered_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "discovered_planets_user_id_planet_id_pk" PRIMARY KEY("user_id","planet_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "discovered_systems" (
	"user_id" uuid NOT NULL,
	"system_id" uuid NOT NULL,
	"discovered_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "discovered_systems_user_id_system_id_pk" PRIMARY KEY("user_id","system_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "discovered_planets" ADD CONSTRAINT "discovered_planets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "discovered_planets" ADD CONSTRAINT "discovered_planets_planet_id_planets_id_fk" FOREIGN KEY ("planet_id") REFERENCES "public"."planets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "discovered_systems" ADD CONSTRAINT "discovered_systems_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "discovered_systems" ADD CONSTRAINT "discovered_systems_system_id_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."systems"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
