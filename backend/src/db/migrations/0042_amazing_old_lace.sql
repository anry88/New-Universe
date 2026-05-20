CREATE TABLE IF NOT EXISTS "player_activity_daily" (
	"user_id" uuid NOT NULL,
	"activity_date" date NOT NULL,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"play_seconds" integer DEFAULT 0 NOT NULL,
	"session_count" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "player_activity_daily_user_id_activity_date_pk" PRIMARY KEY("user_id","activity_date")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "player_activity_daily" ADD CONSTRAINT "player_activity_daily_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "player_activity_daily_date_idx" ON "player_activity_daily" USING btree ("activity_date");