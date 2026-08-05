CREATE TYPE "public"."sprint_outcome" AS ENUM('completed', 'removed', 'carried_to_backlog', 'carried_to_sprint');--> statement-breakpoint
CREATE TYPE "public"."sprint_state" AS ENUM('planned', 'active', 'completed');--> statement-breakpoint
CREATE TABLE "sprint_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sprint_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"joined_by" text NOT NULL,
	"estimate_at_join" numeric(5, 2),
	"estimate_at_start" numeric(5, 2),
	"left_at" timestamp with time zone,
	"outcome" "sprint_outcome",
	"destination_sprint_id" uuid,
	CONSTRAINT "sprint_items_estimate_at_join_range" CHECK ("sprint_items"."estimate_at_join" is null or ("sprint_items"."estimate_at_join" >= 0 and "sprint_items"."estimate_at_join" <= 999.99)),
	CONSTRAINT "sprint_items_estimate_at_start_range" CHECK ("sprint_items"."estimate_at_start" is null or ("sprint_items"."estimate_at_start" >= 0 and "sprint_items"."estimate_at_start" <= 999.99)),
	CONSTRAINT "sprint_items_outcome_consistent" CHECK ((
        ("sprint_items"."left_at" is null and "sprint_items"."outcome" is null and "sprint_items"."destination_sprint_id" is null)
        or ("sprint_items"."left_at" is not null and "sprint_items"."outcome" is not null)
      )),
	CONSTRAINT "sprint_items_destination_consistent" CHECK ((
        ("sprint_items"."outcome" = 'carried_to_sprint' and "sprint_items"."destination_sprint_id" is not null)
        or ("sprint_items"."outcome" is distinct from 'carried_to_sprint' and "sprint_items"."destination_sprint_id" is null)
      ))
);
--> statement-breakpoint
CREATE TABLE "sprints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"backlog_id" uuid NOT NULL,
	"name" text NOT NULL,
	"goal" text,
	"state" "sprint_state" DEFAULT 'planned' NOT NULL,
	"rank" text NOT NULL,
	"capacity_points" numeric(5, 2),
	"planned_start_at" timestamp with time zone,
	"planned_end_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sprints_capacity_points_range" CHECK ("sprints"."capacity_points" is null or ("sprints"."capacity_points" >= 0 and "sprints"."capacity_points" <= 999.99)),
	CONSTRAINT "sprints_planned_dates_order" CHECK ("sprints"."planned_end_at" is null or ("sprints"."planned_start_at" is not null and "sprints"."planned_end_at" > "sprints"."planned_start_at")),
	CONSTRAINT "sprints_state_dates_consistent" CHECK ((
        ("sprints"."state" = 'planned' and "sprints"."started_at" is null and "sprints"."completed_at" is null)
        or ("sprints"."state" = 'active' and "sprints"."started_at" is not null and "sprints"."completed_at" is null)
        or ("sprints"."state" = 'completed' and "sprints"."started_at" is not null and "sprints"."completed_at" is not null and "sprints"."completed_at" >= "sprints"."started_at")
      ))
);
--> statement-breakpoint
ALTER TABLE "sprint_items" ADD CONSTRAINT "sprint_items_sprint_id_sprints_id_fk" FOREIGN KEY ("sprint_id") REFERENCES "public"."sprints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_items" ADD CONSTRAINT "sprint_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_items" ADD CONSTRAINT "sprint_items_joined_by_user_id_fk" FOREIGN KEY ("joined_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_items" ADD CONSTRAINT "sprint_items_destination_sprint_id_sprints_id_fk" FOREIGN KEY ("destination_sprint_id") REFERENCES "public"."sprints"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprints" ADD CONSTRAINT "sprints_backlog_id_backlogs_id_fk" FOREIGN KEY ("backlog_id") REFERENCES "public"."backlogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprints" ADD CONSTRAINT "sprints_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sprint_items_sprint_idx" ON "sprint_items" USING btree ("sprint_id");--> statement-breakpoint
CREATE INDEX "sprint_items_item_idx" ON "sprint_items" USING btree ("item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sprint_items_one_current_item_idx" ON "sprint_items" USING btree ("item_id") WHERE "sprint_items"."left_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "sprints_backlog_rank_idx" ON "sprints" USING btree ("backlog_id","rank");--> statement-breakpoint
CREATE UNIQUE INDEX "sprints_backlog_name_idx" ON "sprints" USING btree ("backlog_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "sprints_one_active_per_backlog_idx" ON "sprints" USING btree ("backlog_id") WHERE "sprints"."state" = 'active';