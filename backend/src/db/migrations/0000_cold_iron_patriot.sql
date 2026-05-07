CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tg_id" bigint NOT NULL,
	"tg_username" text,
	"tg_first_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"premium_until" timestamp,
	"power_score" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "users_tg_id_unique" UNIQUE("tg_id")
);
