CREATE TABLE IF NOT EXISTS "star_payment_support_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"payment_id" integer,
	"reason" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"admin_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "star_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"pack_id" text NOT NULL,
	"diamonds" integer NOT NULL,
	"price_stars" integer NOT NULL,
	"currency" text DEFAULT 'XTR' NOT NULL,
	"invoice_payload" text NOT NULL,
	"telegram_payment_charge_id" text NOT NULL,
	"provider_payment_charge_id" text,
	"refunded" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"refunded_at" timestamp
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "star_payment_support_requests" ADD CONSTRAINT "star_payment_support_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "star_payment_support_requests" ADD CONSTRAINT "star_payment_support_requests_payment_id_star_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."star_payments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "star_payments" ADD CONSTRAINT "star_payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "star_payments_telegram_charge_id_idx" ON "star_payments" USING btree ("telegram_payment_charge_id");
