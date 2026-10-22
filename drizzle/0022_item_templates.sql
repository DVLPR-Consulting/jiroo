CREATE TABLE "item_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"backlog_id" uuid NOT NULL,
	"name" text NOT NULL,
	"item_type" "item_type",
	"kind" "item_kind" DEFAULT 'feature' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"label_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_templates_priority_range" CHECK ("item_templates"."priority" between 0 and 4)
);
--> statement-breakpoint
ALTER TABLE "item_templates" ADD CONSTRAINT "item_templates_backlog_id_backlogs_id_fk" FOREIGN KEY ("backlog_id") REFERENCES "public"."backlogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_templates" ADD CONSTRAINT "item_templates_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "item_templates_backlog_name_idx" ON "item_templates" USING btree ("backlog_id",lower("name"));