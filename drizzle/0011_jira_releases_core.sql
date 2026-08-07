CREATE TYPE "public"."release_incomplete_disposition" AS ENUM('keep', 'move');--> statement-breakpoint
CREATE TYPE "public"."release_item_disposition" AS ENUM('retained', 'moved');--> statement-breakpoint
CREATE TABLE "item_fix_versions" (
	"backlog_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"release_id" uuid NOT NULL,
	"added_by" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "item_fix_versions_item_id_release_id_pk" PRIMARY KEY("item_id","release_id")
);
--> statement-breakpoint
CREATE TABLE "release_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"backlog_id" uuid,
	"release_id" uuid,
	"publication_id" uuid,
	"release_name" text NOT NULL,
	"actor_id" text,
	"actor_label" text NOT NULL,
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
	"item_type" "item_type" NOT NULL,
	"status_id" uuid NOT NULL,
	"status_name" text NOT NULL,
	"status_category" "status_category" NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"estimate_points" numeric(5, 2),
	"disposition" "release_item_disposition" NOT NULL,
	"destination_release_id" uuid,
	"destination_release_name" text,
	CONSTRAINT "release_publication_items_disposition_consistent" CHECK ((
        ("release_publication_items"."disposition" = 'retained' and "release_publication_items"."destination_release_id" is null and "release_publication_items"."destination_release_name" is null)
        or ("release_publication_items"."disposition" = 'moved' and "release_publication_items"."destination_release_name" is not null)
      ))
);
--> statement-breakpoint
CREATE TABLE "release_publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"backlog_id" uuid NOT NULL,
	"release_id" uuid,
	"sequence" integer DEFAULT 1 NOT NULL,
	"release_revision" integer NOT NULL,
	"release_name" text NOT NULL,
	"effective_date" date NOT NULL,
	"incomplete_disposition" "release_incomplete_disposition" NOT NULL,
	"destination_release_id" uuid,
	"destination_release_name" text,
	"published_by" text NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"snapshot_sealed_at" timestamp with time zone,
	"unreleased_at" timestamp with time zone,
	"unreleased_by" text,
	CONSTRAINT "release_publications_revision_positive" CHECK ("release_publications"."release_revision" > 0),
	CONSTRAINT "release_publications_sequence_positive" CHECK ("release_publications"."sequence" > 0),
	CONSTRAINT "release_publications_unreleased_order" CHECK ("release_publications"."unreleased_at" is null or "release_publications"."unreleased_at" >= "release_publications"."published_at"),
	CONSTRAINT "release_publications_unreleased_complete" CHECK (num_nonnulls("release_publications"."unreleased_at", "release_publications"."unreleased_by") in (0, 2)),
	CONSTRAINT "release_publications_incomplete_disposition_consistent" CHECK ((
        ("release_publications"."incomplete_disposition" = 'keep' and "release_publications"."destination_release_id" is null and "release_publications"."destination_release_name" is null)
        or ("release_publications"."incomplete_disposition" = 'move' and "release_publications"."destination_release_name" is not null)
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
	"released_at" timestamp with time zone,
	"released_by" text,
	"effective_release_date" date,
	"revision" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"archived_by" text,
	"driver_id" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "releases_name_nonempty" CHECK (btrim("releases"."name") <> ''),
	CONSTRAINT "releases_revision_positive" CHECK ("releases"."revision" > 0),
	CONSTRAINT "releases_dates_order" CHECK ("releases"."start_date" is null or "releases"."release_date" is null or "releases"."release_date" >= "releases"."start_date"),
	CONSTRAINT "releases_publication_state_complete" CHECK (num_nonnulls("releases"."released_at", "releases"."released_by", "releases"."effective_release_date") in (0, 3)),
	CONSTRAINT "releases_archive_state_complete" CHECK (num_nonnulls("releases"."archived_at", "releases"."archived_by") in (0, 2))
);
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "request_correlation_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "items_backlog_id_idx" ON "items" USING btree ("backlog_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "releases_backlog_id_idx" ON "releases" USING btree ("backlog_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "release_publications_backlog_id_idx" ON "release_publications" USING btree ("backlog_id","id");--> statement-breakpoint
ALTER TABLE "item_fix_versions" ADD CONSTRAINT "item_fix_versions_backlog_id_backlogs_id_fk" FOREIGN KEY ("backlog_id") REFERENCES "public"."backlogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_fix_versions" ADD CONSTRAINT "item_fix_versions_added_by_user_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_fix_versions" ADD CONSTRAINT "item_fix_versions_item_same_backlog_fk" FOREIGN KEY ("backlog_id","item_id") REFERENCES "public"."items"("backlog_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_fix_versions" ADD CONSTRAINT "item_fix_versions_release_same_backlog_fk" FOREIGN KEY ("backlog_id","release_id") REFERENCES "public"."releases"("backlog_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_events" ADD CONSTRAINT "release_events_backlog_id_backlogs_id_fk" FOREIGN KEY ("backlog_id") REFERENCES "public"."backlogs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_events" ADD CONSTRAINT "release_events_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_events" ADD CONSTRAINT "release_events_release_id_releases_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."releases"("id") ON DELETE set null ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "release_events" ADD CONSTRAINT "release_events_publication_id_release_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."release_publications"("id") ON DELETE set null ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "release_events" ADD CONSTRAINT "release_events_release_same_backlog_fk" FOREIGN KEY ("backlog_id","release_id") REFERENCES "public"."releases"("backlog_id","id") ON DELETE set null ("release_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_events" ADD CONSTRAINT "release_events_publication_same_backlog_fk" FOREIGN KEY ("backlog_id","publication_id") REFERENCES "public"."release_publications"("backlog_id","id") ON DELETE set null ("publication_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_publication_items" ADD CONSTRAINT "release_publication_items_backlog_id_backlogs_id_fk" FOREIGN KEY ("backlog_id") REFERENCES "public"."backlogs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_publication_items" ADD CONSTRAINT "release_publication_items_publication_same_backlog_fk" FOREIGN KEY ("backlog_id","publication_id") REFERENCES "public"."release_publications"("backlog_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_publication_items" ADD CONSTRAINT "release_publication_items_item_same_backlog_fk" FOREIGN KEY ("backlog_id","item_id") REFERENCES "public"."items"("backlog_id","id") ON DELETE set null ("item_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_publication_items" ADD CONSTRAINT "release_publication_items_destination_same_backlog_fk" FOREIGN KEY ("backlog_id","destination_release_id") REFERENCES "public"."releases"("backlog_id","id") ON DELETE set null ("destination_release_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_publications" ADD CONSTRAINT "release_publications_backlog_id_backlogs_id_fk" FOREIGN KEY ("backlog_id") REFERENCES "public"."backlogs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_publications" ADD CONSTRAINT "release_publications_published_by_user_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_publications" ADD CONSTRAINT "release_publications_unreleased_by_user_id_fk" FOREIGN KEY ("unreleased_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_publications" ADD CONSTRAINT "release_publications_release_same_backlog_fk" FOREIGN KEY ("backlog_id","release_id") REFERENCES "public"."releases"("backlog_id","id") ON DELETE set null ("release_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_publications" ADD CONSTRAINT "release_publications_destination_same_backlog_fk" FOREIGN KEY ("backlog_id","destination_release_id") REFERENCES "public"."releases"("backlog_id","id") ON DELETE set null ("destination_release_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_backlog_id_backlogs_id_fk" FOREIGN KEY ("backlog_id") REFERENCES "public"."backlogs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_released_by_user_id_fk" FOREIGN KEY ("released_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_archived_by_user_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_driver_id_user_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "releases" ADD CONSTRAINT "releases_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_fix_versions_release_idx" ON "item_fix_versions" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX "release_events_release_idx" ON "release_events" USING btree ("release_id");--> statement-breakpoint
CREATE INDEX "release_events_backlog_idx" ON "release_events" USING btree ("backlog_id");--> statement-breakpoint
CREATE UNIQUE INDEX "release_publication_items_publication_key_idx" ON "release_publication_items" USING btree ("publication_id","item_key");--> statement-breakpoint
CREATE INDEX "release_publication_items_item_idx" ON "release_publication_items" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "release_publications_backlog_idx" ON "release_publications" USING btree ("backlog_id");--> statement-breakpoint
CREATE UNIQUE INDEX "release_publications_release_sequence_idx" ON "release_publications" USING btree ("release_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "release_publications_one_active_per_release_idx" ON "release_publications" USING btree ("release_id") WHERE "release_publications"."unreleased_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "releases_backlog_name_idx" ON "releases" USING btree ("backlog_id",lower(btrim("name")));--> statement-breakpoint
CREATE FUNCTION "protect_release_publications_snapshot"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'release publication snapshots are immutable' USING ERRCODE = '55000';
  END IF;

  IF (to_jsonb(NEW) - ARRAY[
        'release_id', 'destination_release_id', 'snapshot_sealed_at',
        'unreleased_at', 'unreleased_by'
      ]) IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY[
        'release_id', 'destination_release_id', 'snapshot_sealed_at',
        'unreleased_at', 'unreleased_by'
      ])
     OR NOT (
       (NEW.release_id IS NOT DISTINCT FROM OLD.release_id
        OR (pg_trigger_depth() > 1 AND OLD.release_id IS NOT NULL AND NEW.release_id IS NULL))
       AND (NEW.destination_release_id IS NOT DISTINCT FROM OLD.destination_release_id
        OR (pg_trigger_depth() > 1 AND OLD.destination_release_id IS NOT NULL AND NEW.destination_release_id IS NULL))
       AND (NEW.snapshot_sealed_at IS NOT DISTINCT FROM OLD.snapshot_sealed_at
        OR (OLD.snapshot_sealed_at IS NULL AND NEW.snapshot_sealed_at IS NOT NULL))
       AND (
         (NEW.unreleased_at IS NOT DISTINCT FROM OLD.unreleased_at
          AND NEW.unreleased_by IS NOT DISTINCT FROM OLD.unreleased_by)
         OR (OLD.unreleased_at IS NULL AND OLD.unreleased_by IS NULL
          AND NEW.unreleased_at IS NOT NULL AND NEW.unreleased_by IS NOT NULL)
       )
     ) THEN
    RAISE EXCEPTION 'release publication snapshots are immutable' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "release_publications_immutable"
BEFORE UPDATE OR DELETE ON "release_publications"
FOR EACH ROW EXECUTE FUNCTION "protect_release_publications_snapshot"();--> statement-breakpoint
CREATE FUNCTION "protect_release_publication_items_snapshot"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'release publication item snapshots are immutable' USING ERRCODE = '55000';
  END IF;

  IF (to_jsonb(NEW) - ARRAY['item_id', 'destination_release_id'])
       IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['item_id', 'destination_release_id'])
     OR NOT (
       (NEW.item_id IS NOT DISTINCT FROM OLD.item_id
        OR (pg_trigger_depth() > 1 AND OLD.item_id IS NOT NULL AND NEW.item_id IS NULL))
       AND (NEW.destination_release_id IS NOT DISTINCT FROM OLD.destination_release_id
        OR (pg_trigger_depth() > 1 AND OLD.destination_release_id IS NOT NULL AND NEW.destination_release_id IS NULL))
     ) THEN
    RAISE EXCEPTION 'release publication item snapshots are immutable' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "release_publication_items_immutable"
BEFORE UPDATE OR DELETE ON "release_publication_items"
FOR EACH ROW EXECUTE FUNCTION "protect_release_publication_items_snapshot"();--> statement-breakpoint
CREATE FUNCTION "reject_sealed_release_publication_item"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1
  FROM release_publications
  WHERE id = NEW.publication_id
    AND snapshot_sealed_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'release publication snapshot is sealed' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "release_publication_items_reject_sealed_insert"
BEFORE INSERT ON "release_publication_items"
FOR EACH ROW EXECUTE FUNCTION "reject_sealed_release_publication_item"();--> statement-breakpoint
CREATE FUNCTION "protect_release_events_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'release events are append-only' USING ERRCODE = '55000';
  END IF;

  IF (to_jsonb(NEW) - ARRAY['backlog_id', 'release_id', 'publication_id', 'actor_id'])
       IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['backlog_id', 'release_id', 'publication_id', 'actor_id'])
     OR NOT (
       (NEW.backlog_id IS NOT DISTINCT FROM OLD.backlog_id
        OR (pg_trigger_depth() > 1 AND OLD.backlog_id IS NOT NULL AND NEW.backlog_id IS NULL))
       AND (NEW.release_id IS NOT DISTINCT FROM OLD.release_id
        OR (pg_trigger_depth() > 1 AND OLD.release_id IS NOT NULL AND NEW.release_id IS NULL))
       AND (NEW.publication_id IS NOT DISTINCT FROM OLD.publication_id
        OR (pg_trigger_depth() > 1 AND OLD.publication_id IS NOT NULL AND NEW.publication_id IS NULL))
       AND (NEW.actor_id IS NOT DISTINCT FROM OLD.actor_id
        OR (pg_trigger_depth() > 1 AND OLD.actor_id IS NOT NULL AND NEW.actor_id IS NULL))
     ) THEN
    RAISE EXCEPTION 'release events are append-only' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "release_events_append_only"
BEFORE UPDATE OR DELETE ON "release_events"
FOR EACH ROW EXECUTE FUNCTION "protect_release_events_append_only"();
