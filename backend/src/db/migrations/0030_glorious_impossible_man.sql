CREATE TABLE IF NOT EXISTS "jump_gates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"home_system_id" uuid NOT NULL,
	"calibration_status" text DEFAULT 'idle' NOT NULL,
	"calibration_mode" text,
	"calibration_target_system_id" uuid,
	"calibration_started_at" timestamp,
	"calibration_completes_at" timestamp,
	"random_jump_ready_at" timestamp,
	"last_random_jump_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "jump_gates" ADD CONSTRAINT "jump_gates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "jump_gates" ADD CONSTRAINT "jump_gates_home_system_id_systems_id_fk" FOREIGN KEY ("home_system_id") REFERENCES "public"."systems"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "jump_gates" ADD CONSTRAINT "jump_gates_calibration_target_system_id_systems_id_fk" FOREIGN KEY ("calibration_target_system_id") REFERENCES "public"."systems"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "jump_gates_user_id_idx" ON "jump_gates" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "jump_gates_home_system_id_idx" ON "jump_gates" USING btree ("home_system_id");