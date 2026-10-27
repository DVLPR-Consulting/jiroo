ALTER TABLE "absences" DROP CONSTRAINT "absences_dates_order";--> statement-breakpoint
ALTER TABLE "absences" ADD COLUMN "start_half" text DEFAULT 'am' NOT NULL;--> statement-breakpoint
ALTER TABLE "absences" ADD COLUMN "end_half" text DEFAULT 'pm' NOT NULL;--> statement-breakpoint
ALTER TABLE "absences" ADD CONSTRAINT "absences_halves" CHECK ("absences"."start_half" in ('am', 'pm') and "absences"."end_half" in ('am', 'pm'));--> statement-breakpoint
ALTER TABLE "absences" ADD CONSTRAINT "absences_dates_order" CHECK ("absences"."end_date" > "absences"."start_date" or ("absences"."end_date" = "absences"."start_date" and ("absences"."start_half" = 'am' or "absences"."end_half" = 'pm')));