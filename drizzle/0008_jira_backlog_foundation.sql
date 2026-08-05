ALTER TYPE "public"."display_mode" ADD VALUE 'backlog' BEFORE 'board';--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "estimate_points" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_estimate_points_range" CHECK ("items"."estimate_points" is null or ("items"."estimate_points" >= 0 and "items"."estimate_points" <= 999.99));