ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tutorial_step" integer DEFAULT 0 NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tutorial_completed_at" timestamp;
