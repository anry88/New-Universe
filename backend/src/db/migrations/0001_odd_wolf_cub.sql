CREATE TABLE IF NOT EXISTS "resources" (
	"id" text PRIMARY KEY NOT NULL,
	"name" jsonb NOT NULL,
	"tier" integer NOT NULL,
	"symbol" text NOT NULL,
	"base_regen_rate" integer NOT NULL,
	"default_storage_cap" integer NOT NULL
);
