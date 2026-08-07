CREATE TYPE "public"."release_incomplete_disposition" AS ENUM('keep', 'move');--> statement-breakpoint
CREATE TYPE "public"."release_item_disposition" AS ENUM('retained', 'moved');--> statement-breakpoint
CREATE TABLE "item_fix_versions" (
	"backlog_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"release_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_fix_versions_item_id_release_id_pk" PRIMARY KEY("item_id","release_id")
);
--> statement-breakpoint
CREATE TABLE "release_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"backlog_id" uuid NOT NULL,
	"release_id" uuid,
	"publication_id" uuid,
	"release_name" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"old_value" jsonb,
	"new_value" jsonb,
	"request_correlation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "release_publication_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publication_id" uuid NOT NULL,
	"backlog_id" uuid NOT NULL,
	"item_id" uuid,
	"item_key" text NOT NULL,
	"item_title" text NOT NULL,
	"status_name" text NOT NULL,
	"disposition" "release_item_disposition" NOT NULL,
	"destination_release_id" uuid,
	CONSTRAINT "release_publication_items_disposition_consistent" CHECK ((
        ("release_publication_items"."disposition" = 'retained' and "release_publication_items"."destination_release_id" is null)
        or ("release_publication_items"."disposition" = 'moved' and "release_publication_items"."destination_release_id" is not null)
      ))
);
--> statement-breakpoint
CREATE TABLE "release_publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"backlog_id" uuid NOT NULL,
	"release_id" uuid,
	"release_revision" integer NOT NULL,
	"release_name" text NOT NULL,
	"effective_date" date NOT NULL,
	"incomplete_disposition" "release_incomplete_disposition" NOT NULL,
	"destination_release_id" uuid,
	"published_by" text NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone,
	CONSTRAINT "release_publications_revision_positive" CHECK ("release_publications"."release_revision" > 0),
	CONSTRAINT "release_publications_superseded_order" CHECK ("release_publications"."superseded_at" is null or "release_publications"."superseded_at" >= "release_publications"."published_at"),
	CONSTRAINT "release_publications_incomplete_disposition_consistent" CHECK ((
        ("release_publications"."incomplete_disposition" = 'keep' and "release_publications"."destination_release_id" is null)
        or ("release_publications"."incomplete_disposition" = 'move' and "release_publications"."destination_release_id" is not null)
      ))
);
--> statement-breakpoint
CREATE TABLE "releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"backlog_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"start_date" date,
	"release_date" date,
	"revision" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "releases_revision_positive" CHECK ("releases"."revision" > 0),
	CONSTRAINT "releases_dates_order" CHECK ("releases"."start_date" is null or "releases"."release_date" is null or "releases"."release_date" >= "releases"."start_date")
);
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "request_correlation_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "items_backlog_id_idx" ON "items" USING btree ("backlog_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "releases_backlog_id_idx" ON "releases" USING btree ("backlog_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "release_publications_backlog_id_idx" ON "release_publications" USING btree ("backlog_id","id");--> statement-breakpoint
ALTER TABLE "item_fix_versions" ADD CONSTRAINT "item_fix_versions_backlog_id_backlogs_id_fk" FOREIGN KEY ("backlog_id") REFERENCES "public"."backlogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_fix_versions" ADD CONSTRAINT "item_fix_versions_item_same_backlog_fk" FOREIGN KEY ("backlog_id","item_id") REFERENCES "public"."items"("backlog_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_fix_versions" ADD CONSTRAINT "item_fix_versions_release_same_backlog_fk" FOREIGN KEY ("backlog_id","release_id") REFERENCES "public"."releases"("backlog_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_events" ADD CONSTRAINT "release_events_backlog_id_backlogs_id_fk" FOREIGN KEY ("backlog_id") REFERENCES "public"."backlogs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_events" ADD CONSTRAINT "release_events_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_events" ADD CONSTRAINT "release_events_release_same_backlog_fk" FOREIGN KEY ("backlog_id","release_id") REFERENCES "public"."releases"("backlog_id","id") ON DELETE set null ("release_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_events" ADD CONSTRAINT "release_events_publication_same_backlog_fk" FOREIGN KEY ("backlog_id","publication_id") REFERENCES "public"."release_publications"("backlog_id","id") ON DELETE set null ("publication_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_publication_items" ADD CONSTRAINT "release_publication_items_backlog_id_backlogs_id_fk" FOREIGN KEY ("backlog_id") REFERENCES "public"."backlogs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_publication_items" ADD CONSTRAINT "release_publication_items_publication_same_backlog_fk" FOREIGN KEY ("backlog_id","publication_id") REFERENCES "public"."release_publications"("backlog_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_publication_items" ADD CONSTRAINT "release_publication_items_item_same_backlog_fk" FOREIGN KEY ("backlog_id","item_id") REFERENCES "public"."items"("backlog_id","id") ON DELETE set null ("item_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_publication_items" ADD CONSTRAINT "release_publication_items_destination_same_backlog_fk" FOREIGN KEY ("backlog_id","destination_release_id") REFERENCES "public"."releases"("backlog_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_publications" ADD CONSTRAINT "release_publications_backlog_id_backlogs_id_fk" FOREIGN KEY ("backlog_id") REFERENCES "public"."backlogs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_publications" ADD CONSTRAINT "release_publications_published_by_user_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_publications" ADD CONSTRAINT "release_publications_release_same_backlog_fk" FOREIGN KEY ("backlog_id","release_id") REFERENCES "public"."releases"("backlog_id","id") ON DELETE set null ("release_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_publications" ADD CONSTRAINT "release_publications_destination_same_backlog_fk" FOREIGN KEY ("backlog_id","destination_release_id") REFERENCES "public"."releases"("backlog_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_backlog_id_backlogs_id_fk" FOREIGN KEY ("backlog_id") REFERENCES "public"."backlogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_fix_versions_release_idx" ON "item_fix_versions" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX "release_events_release_idx" ON "release_events" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX "release_events_backlog_idx" ON "release_events" USING btree ("backlog_id");--> statement-breakpoint
CREATE UNIQUE INDEX "release_publication_items_publication_item_idx" ON "release_publication_items" USING btree ("publication_id","item_id") WHERE "release_publication_items"."item_id" is not null;--> statement-breakpoint
CREATE INDEX "release_publication_items_item_idx" ON "release_publication_items" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "release_publications_backlog_idx" ON "release_publications" USING btree ("backlog_id");--> statement-breakpoint
CREATE UNIQUE INDEX "release_publications_one_active_per_release_idx" ON "release_publications" USING btree ("release_id") WHERE "release_publications"."superseded_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "releases_backlog_name_idx" ON "releases" USING btree ("backlog_id",lower("name"));
