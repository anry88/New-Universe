ALTER TABLE "notifications" ADD COLUMN "delivery_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "failed_at" timestamp;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "failure_code" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "failure_reason" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "last_attempt_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "telegram_notifications_blocked_at" timestamp;--> statement-breakpoint
UPDATE "notifications"
SET "delivery_status" = CASE
  WHEN "pending" = true THEN 'pending'
  WHEN "sent_at" IS NOT NULL THEN 'sent'
  WHEN "read" = true THEN 'skipped'
  ELSE 'skipped'
END;
