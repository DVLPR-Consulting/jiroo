-- Due dates become calendar days (JIR-101). Inputs were parsed as UTC
-- midnight, so the UTC day is the day the user picked.
ALTER TABLE "items" ALTER COLUMN "due_date" SET DATA TYPE date USING ("due_date" AT TIME ZONE 'UTC')::date;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "start_date" date;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_start_before_due" CHECK ("items"."start_date" is null or "items"."due_date" is null or "items"."start_date" <= "items"."due_date");
