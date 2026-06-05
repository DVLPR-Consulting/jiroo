CREATE TYPE "public"."link_type" AS ENUM('blocks', 'relates', 'duplicates');--> statement-breakpoint
CREATE TABLE "item_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"type" "link_type" NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_links_no_self" CHECK ("item_links"."source_id" <> "item_links"."target_id")
);
--> statement-breakpoint
ALTER TABLE "item_links" ADD CONSTRAINT "item_links_source_id_items_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_links" ADD CONSTRAINT "item_links_target_id_items_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_links" ADD CONSTRAINT "item_links_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_links_source_idx" ON "item_links" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "item_links_target_idx" ON "item_links" USING btree ("target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "item_links_uniq" ON "item_links" USING btree ("source_id","target_id","type");