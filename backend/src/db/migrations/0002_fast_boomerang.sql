CREATE TABLE IF NOT EXISTS "research_branches" (
	"id" text PRIMARY KEY NOT NULL,
	"name" jsonb NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "research_progress" (
	"user_id" uuid NOT NULL,
	"branch" text NOT NULL,
	"level" integer DEFAULT 0 NOT NULL,
	"completes_at" timestamp,
	CONSTRAINT "research_progress_user_id_branch_pk" PRIMARY KEY("user_id","branch")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "research_progress" ADD CONSTRAINT "research_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "research_progress" ADD CONSTRAINT "research_progress_branch_research_branches_id_fk" FOREIGN KEY ("branch") REFERENCES "public"."research_branches"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
