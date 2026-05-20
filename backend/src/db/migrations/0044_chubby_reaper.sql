CREATE TABLE IF NOT EXISTS "star_checkout_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"pack_id" text NOT NULL,
	"checkout_id" text NOT NULL,
	"invoice_payload" text NOT NULL,
	"diamonds" integer NOT NULL,
	"price_stars" integer NOT NULL,
	"currency" text DEFAULT 'XTR' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "star_checkout_attempts" ADD CONSTRAINT "star_checkout_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "star_checkout_attempts_checkout_id_idx" ON "star_checkout_attempts" USING btree ("checkout_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "star_checkout_attempts_created_pack_idx" ON "star_checkout_attempts" USING btree ("created_at","pack_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "star_checkout_attempts_user_created_idx" ON "star_checkout_attempts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "star_payments_created_pack_idx" ON "star_payments" USING btree ("created_at","pack_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_created_at_idx" ON "users" USING btree ("created_at");--> statement-breakpoint
INSERT INTO "star_checkout_attempts" (
  "user_id",
  "pack_id",
  "checkout_id",
  "invoice_payload",
  "diamonds",
  "price_stars",
  "currency",
  "created_at"
)
SELECT
  "user_id",
  "pack_id",
  coalesce((regexp_match("invoice_payload", 'checkout=([^;]+)'))[1], 'legacy-payment-' || "id"::text),
  "invoice_payload",
  "diamonds",
  "price_stars",
  "currency",
  "created_at"
FROM "star_payments"
ON CONFLICT ("checkout_id") DO NOTHING;
