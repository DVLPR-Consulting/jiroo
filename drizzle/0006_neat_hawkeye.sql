CREATE TYPE "public"."item_kind" AS ENUM('feature', 'bug');--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "kind" "item_kind" DEFAULT 'feature' NOT NULL;