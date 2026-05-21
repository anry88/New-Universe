CREATE TABLE IF NOT EXISTS "telegram_registration_referrals" (
	"tg_id" bigint PRIMARY KEY NOT NULL,
	"referral_code" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "registration_source" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "registration_source_code" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "telegram_registration_referrals_referral_code_idx" ON "telegram_registration_referrals" USING btree ("referral_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "telegram_registration_referrals_updated_at_idx" ON "telegram_registration_referrals" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_registration_source_code_idx" ON "users" USING btree ("registration_source_code");