CREATE TYPE "public"."ref_kind" AS ENUM('pr', 'commit', 'branch', 'repo', 'other');--> statement-breakpoint
CREATE TABLE "item_refs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"url" text NOT NULL,
	"kind" "ref_kind" NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "item_refs" ADD CONSTRAINT "item_refs_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_refs" ADD CONSTRAINT "item_refs_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_refs_item_idx" ON "item_refs" USING btree ("item_id");