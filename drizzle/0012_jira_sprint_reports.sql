CREATE TYPE "public"."sprint_event_type" AS ENUM('sprint_started', 'item_added', 'item_removed', 'estimate_changed', 'item_completed', 'item_reopened', 'sprint_completed');--> statement-breakpoint
CREATE TYPE "public"."sprint_removal_reason" AS ENUM('manual', 'moved', 'deleted');--> statement-breakpoint
CREATE SEQUENCE "public"."sprint_event_sequence" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "sprint_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"backlog_id" uuid NOT NULL,
	"sprint_id" uuid NOT NULL,
	"event_type" "sprint_event_type" NOT NULL,
	"source_membership_id" uuid,
	"item_id" uuid,
	"item_key" text,
	"item_title" text,
	"actor_id" text NOT NULL,
	"request_correlation_id" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"sequence" bigint DEFAULT nextval('sprint_event_sequence') NOT NULL,
	"previous_estimate" numeric(5, 2),
	"next_estimate" numeric(5, 2),
	"previous_done" boolean,
	"next_done" boolean,
	"related_sprint_id" uuid,
	"related_sprint_name" text,
	"removal_reason" "sprint_removal_reason",
	CONSTRAINT "sprint_events_request_correlation_length" CHECK (char_length(btrim("sprint_events"."request_correlation_id")) between 1 and 128),
	CONSTRAINT "sprint_events_related_sprint_name_required" CHECK (("sprint_events"."related_sprint_id" is null) or ("sprint_events"."related_sprint_name" is not null)),
	CONSTRAINT "sprint_events_shape" CHECK ((
        ("sprint_events"."event_type" in ('sprint_started', 'sprint_completed')
          and "sprint_events"."item_key" is null and "sprint_events"."item_title" is null
          and "sprint_events"."previous_estimate" is null and "sprint_events"."next_estimate" is null
          and "sprint_events"."previous_done" is null and "sprint_events"."next_done" is null
          and "sprint_events"."removal_reason" is null)
        or ("sprint_events"."event_type" = 'item_added'
          and "sprint_events"."item_key" is not null and "sprint_events"."item_title" is not null
          and "sprint_events"."previous_estimate" is null
          and "sprint_events"."previous_done" is null and "sprint_events"."next_done" is null
          and "sprint_events"."removal_reason" is null)
        or ("sprint_events"."event_type" = 'item_removed'
          and "sprint_events"."item_key" is not null and "sprint_events"."item_title" is not null
          and "sprint_events"."next_estimate" is null
          and "sprint_events"."previous_done" is null and "sprint_events"."next_done" is null
          and "sprint_events"."removal_reason" is not null)
        or ("sprint_events"."event_type" = 'estimate_changed'
          and "sprint_events"."item_key" is not null and "sprint_events"."item_title" is not null
          and "sprint_events"."previous_estimate" is distinct from "sprint_events"."next_estimate"
          and "sprint_events"."previous_done" is null and "sprint_events"."next_done" is null
          and "sprint_events"."removal_reason" is null)
        or ("sprint_events"."event_type" = 'item_completed'
          and "sprint_events"."item_key" is not null and "sprint_events"."item_title" is not null
          and "sprint_events"."previous_done" = false and "sprint_events"."next_done" = true
          and "sprint_events"."previous_estimate" is null and "sprint_events"."next_estimate" is null
          and "sprint_events"."removal_reason" is null)
        or ("sprint_events"."event_type" = 'item_reopened'
          and "sprint_events"."item_key" is not null and "sprint_events"."item_title" is not null
          and "sprint_events"."previous_done" = true and "sprint_events"."next_done" = false
          and "sprint_events"."previous_estimate" is null and "sprint_events"."next_estimate" is null
          and "sprint_events"."removal_reason" is null)
      ))
);
--> statement-breakpoint
CREATE TABLE "sprint_report_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"backlog_id" uuid NOT NULL,
	"sprint_id" uuid NOT NULL,
	"source_item_id" uuid,
	"item_key" text NOT NULL,
	"item_title" text NOT NULL,
	"item_type" "item_type" NOT NULL,
	"item_kind" "item_kind" NOT NULL,
	"first_joined_at" timestamp with time zone NOT NULL,
	"final_left_at" timestamp with time zone NOT NULL,
	"initial_commitment" boolean NOT NULL,
	"added_after_start" boolean NOT NULL,
	"removed_after_start" boolean NOT NULL,
	"estimate_at_start" numeric(5, 2),
	"estimate_at_final_participation" numeric(5, 2),
	"estimate_at_completion" numeric(5, 2),
	"final_status_category" "status_category" NOT NULL,
	"final_outcome" "sprint_outcome" NOT NULL,
	"destination_sprint_id" uuid,
	"destination_sprint_name" text,
	CONSTRAINT "sprint_report_items_outcome_destination_consistent" CHECK ((
        ("sprint_report_items"."final_outcome" = 'carried_to_sprint' and "sprint_report_items"."destination_sprint_name" is not null)
        or ("sprint_report_items"."final_outcome" is distinct from 'carried_to_sprint'
          and "sprint_report_items"."destination_sprint_id" is null and "sprint_report_items"."destination_sprint_name" is null)
      ))
);
--> statement-breakpoint
CREATE TABLE "sprint_report_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"backlog_id" uuid NOT NULL,
	"sprint_id" uuid NOT NULL,
	"sprint_name" text NOT NULL,
	"sprint_goal" text,
	"planned_start_at" timestamp with time zone,
	"planned_end_at" timestamp with time zone,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"initial_item_count" integer NOT NULL,
	"committed_points" numeric(12, 2) NOT NULL,
	"initial_unestimated_count" integer NOT NULL,
	"final_item_count" integer NOT NULL,
	"completed_item_count" integer NOT NULL,
	"completed_points" numeric(12, 2) NOT NULL,
	"final_unestimated_count" integer NOT NULL,
	"gross_points_added" numeric(12, 2) NOT NULL,
	"gross_points_removed" numeric(12, 2) NOT NULL,
	"net_estimate_delta" numeric(12, 2) NOT NULL,
	"scope_event_count" integer NOT NULL,
	"final_destination_summary" jsonb NOT NULL,
	"request_correlation_id" text NOT NULL,
	CONSTRAINT "sprint_report_snapshots_request_correlation_length" CHECK (char_length(btrim("sprint_report_snapshots"."request_correlation_id")) between 1 and 128),
	CONSTRAINT "sprint_report_snapshots_counts_nonnegative" CHECK ("sprint_report_snapshots"."initial_item_count" >= 0
        and "sprint_report_snapshots"."initial_unestimated_count" >= 0
        and "sprint_report_snapshots"."final_item_count" >= 0
        and "sprint_report_snapshots"."completed_item_count" >= 0
        and "sprint_report_snapshots"."final_unestimated_count" >= 0
        and "sprint_report_snapshots"."scope_event_count" >= 0),
	CONSTRAINT "sprint_report_snapshots_completed_count_within_final" CHECK ("sprint_report_snapshots"."completed_item_count" <= "sprint_report_snapshots"."final_item_count")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "sprints_backlog_id_idx" ON "sprints" USING btree ("backlog_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "sprint_items_sprint_id_idx" ON "sprint_items" USING btree ("sprint_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "sprint_report_snapshots_backlog_sprint_id_idx" ON "sprint_report_snapshots" USING btree ("backlog_id","sprint_id","id");--> statement-breakpoint
ALTER TABLE "sprint_events" ADD CONSTRAINT "sprint_events_backlog_id_backlogs_id_fk" FOREIGN KEY ("backlog_id") REFERENCES "public"."backlogs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_events" ADD CONSTRAINT "sprint_events_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_events" ADD CONSTRAINT "sprint_events_sprint_same_backlog_fk" FOREIGN KEY ("backlog_id","sprint_id") REFERENCES "public"."sprints"("backlog_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_events" ADD CONSTRAINT "sprint_events_membership_same_sprint_fk" FOREIGN KEY ("sprint_id","source_membership_id") REFERENCES "public"."sprint_items"("sprint_id","id") ON DELETE set null ("source_membership_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_events" ADD CONSTRAINT "sprint_events_item_same_backlog_fk" FOREIGN KEY ("backlog_id","item_id") REFERENCES "public"."items"("backlog_id","id") ON DELETE set null ("item_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_events" ADD CONSTRAINT "sprint_events_related_sprint_same_backlog_fk" FOREIGN KEY ("backlog_id","related_sprint_id") REFERENCES "public"."sprints"("backlog_id","id") ON DELETE set null ("related_sprint_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_report_items" ADD CONSTRAINT "sprint_report_items_backlog_id_backlogs_id_fk" FOREIGN KEY ("backlog_id") REFERENCES "public"."backlogs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_report_items" ADD CONSTRAINT "sprint_report_items_snapshot_same_sprint_fk" FOREIGN KEY ("backlog_id","sprint_id","snapshot_id") REFERENCES "public"."sprint_report_snapshots"("backlog_id","sprint_id","id") ON DELETE restrict ON UPDATE no action DEFERRABLE INITIALLY DEFERRED;--> statement-breakpoint
ALTER TABLE "sprint_report_items" ADD CONSTRAINT "sprint_report_items_source_item_same_backlog_fk" FOREIGN KEY ("backlog_id","source_item_id") REFERENCES "public"."items"("backlog_id","id") ON DELETE set null ("source_item_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_report_items" ADD CONSTRAINT "sprint_report_items_destination_sprint_same_backlog_fk" FOREIGN KEY ("backlog_id","destination_sprint_id") REFERENCES "public"."sprints"("backlog_id","id") ON DELETE set null ("destination_sprint_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_report_snapshots" ADD CONSTRAINT "sprint_report_snapshots_backlog_id_backlogs_id_fk" FOREIGN KEY ("backlog_id") REFERENCES "public"."backlogs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_report_snapshots" ADD CONSTRAINT "sprint_report_snapshots_sprint_id_sprints_id_fk" FOREIGN KEY ("sprint_id") REFERENCES "public"."sprints"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_report_snapshots" ADD CONSTRAINT "sprint_report_snapshots_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sprint_report_snapshots" ADD CONSTRAINT "sprint_report_snapshots_sprint_same_backlog_fk" FOREIGN KEY ("backlog_id","sprint_id") REFERENCES "public"."sprints"("backlog_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sprint_events_sequence_idx" ON "sprint_events" USING btree ("sequence");--> statement-breakpoint
CREATE INDEX "sprint_events_sprint_occurred_sequence_idx" ON "sprint_events" USING btree ("sprint_id","occurred_at","sequence");--> statement-breakpoint
CREATE INDEX "sprint_events_backlog_sprint_idx" ON "sprint_events" USING btree ("backlog_id","sprint_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sprint_report_items_snapshot_key_idx" ON "sprint_report_items" USING btree ("snapshot_id","item_key");--> statement-breakpoint
CREATE INDEX "sprint_report_items_backlog_sprint_idx" ON "sprint_report_items" USING btree ("backlog_id","sprint_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sprint_report_snapshots_sprint_idx" ON "sprint_report_snapshots" USING btree ("sprint_id");--> statement-breakpoint
CREATE FUNCTION "protect_sprint_events_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'sprint events are append-only' USING ERRCODE = '55000';
  END IF;

  IF pg_trigger_depth() <= 1 THEN
    RAISE EXCEPTION 'sprint events are append-only' USING ERRCODE = '55000';
  END IF;

  IF (to_jsonb(NEW) - ARRAY['item_id', 'source_membership_id', 'related_sprint_id'])
       IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['item_id', 'source_membership_id', 'related_sprint_id'])
     OR NOT (
       (NEW.item_id IS NOT DISTINCT FROM OLD.item_id
        OR (pg_trigger_depth() > 1 AND OLD.item_id IS NOT NULL AND NEW.item_id IS NULL))
       AND (NEW.source_membership_id IS NOT DISTINCT FROM OLD.source_membership_id
        OR (pg_trigger_depth() > 1 AND OLD.source_membership_id IS NOT NULL AND NEW.source_membership_id IS NULL))
       AND (NEW.related_sprint_id IS NOT DISTINCT FROM OLD.related_sprint_id
        OR (pg_trigger_depth() > 1 AND OLD.related_sprint_id IS NOT NULL AND NEW.related_sprint_id IS NULL))
     ) THEN
    RAISE EXCEPTION 'sprint events are append-only' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "sprint_events_append_only"
BEFORE UPDATE OR DELETE ON "sprint_events"
FOR EACH ROW EXECUTE FUNCTION "protect_sprint_events_append_only"();--> statement-breakpoint
CREATE FUNCTION "protect_sprint_report_snapshots_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'sprint report snapshots are append-only' USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "sprint_report_snapshots_append_only"
BEFORE UPDATE OR DELETE ON "sprint_report_snapshots"
FOR EACH ROW EXECUTE FUNCTION "protect_sprint_report_snapshots_append_only"();--> statement-breakpoint
CREATE FUNCTION "protect_sprint_report_items_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'sprint report items are append-only' USING ERRCODE = '55000';
  END IF;

  IF pg_trigger_depth() <= 1 THEN
    RAISE EXCEPTION 'sprint report items are append-only' USING ERRCODE = '55000';
  END IF;

  IF (to_jsonb(NEW) - ARRAY['source_item_id', 'destination_sprint_id'])
       IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['source_item_id', 'destination_sprint_id'])
     OR NOT (
       (NEW.source_item_id IS NOT DISTINCT FROM OLD.source_item_id
        OR (pg_trigger_depth() > 1 AND OLD.source_item_id IS NOT NULL AND NEW.source_item_id IS NULL))
       AND (NEW.destination_sprint_id IS NOT DISTINCT FROM OLD.destination_sprint_id
        OR (pg_trigger_depth() > 1 AND OLD.destination_sprint_id IS NOT NULL AND NEW.destination_sprint_id IS NULL))
     ) THEN
    RAISE EXCEPTION 'sprint report items are append-only' USING ERRCODE = '55000';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "sprint_report_items_append_only"
BEFORE UPDATE OR DELETE ON "sprint_report_items"
FOR EACH ROW EXECUTE FUNCTION "protect_sprint_report_items_append_only"();--> statement-breakpoint
CREATE FUNCTION "serialize_sprint_report_snapshot_insert"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.id::text, 0));
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "sprint_report_snapshots_serialize_insert"
BEFORE INSERT ON "sprint_report_snapshots"
FOR EACH ROW EXECUTE FUNCTION "serialize_sprint_report_snapshot_insert"();--> statement-breakpoint
CREATE FUNCTION "reject_sealed_sprint_report_item"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.snapshot_id::text, 0));
  IF EXISTS (
    SELECT 1 FROM sprint_report_snapshots WHERE id = NEW.snapshot_id
  ) THEN
    RAISE EXCEPTION 'sprint report snapshot is sealed' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "sprint_report_items_reject_sealed_insert"
BEFORE INSERT ON "sprint_report_items"
FOR EACH ROW EXECUTE FUNCTION "reject_sealed_sprint_report_item"();
