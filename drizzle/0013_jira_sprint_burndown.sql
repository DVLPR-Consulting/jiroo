ALTER TABLE "sprint_events" DROP CONSTRAINT "sprint_events_shape";--> statement-breakpoint
ALTER TABLE "sprint_items" ADD COLUMN "done_at_start" boolean;--> statement-breakpoint
ALTER TABLE "sprint_report_items" ADD COLUMN "done_at_start" boolean;--> statement-breakpoint
ALTER TABLE "sprint_events" ADD CONSTRAINT "sprint_events_shape" CHECK (
  (event_type in ('sprint_started', 'sprint_completed')
    and item_key is null and item_title is null
    and previous_estimate is null and next_estimate is null
    and previous_done is null and next_done is null
    and removal_reason is null)
  or (event_type = 'item_added'
    and item_key is not null and item_title is not null
    and previous_estimate is null
    and previous_done is null and next_done is not null
    and removal_reason is null)
  or (event_type = 'item_removed'
    and item_key is not null and item_title is not null
    and next_estimate is null
    and previous_done is null and next_done is null
    and removal_reason is not null)
  or (event_type = 'estimate_changed'
    and item_key is not null and item_title is not null
    and previous_estimate is distinct from next_estimate
    and previous_done is null and next_done is null
    and removal_reason is null)
  or (event_type = 'item_completed'
    and item_key is not null and item_title is not null
    and previous_done = false and next_done = true
    and previous_estimate is null and next_estimate is null
    and removal_reason is null)
  or (event_type = 'item_reopened'
    and item_key is not null and item_title is not null
    and previous_done = true and next_done = false
    and previous_estimate is null and next_estimate is null
    and removal_reason is null)
) NOT VALID;--> statement-breakpoint
ALTER TABLE "sprint_report_items" ADD CONSTRAINT "sprint_report_items_done_at_start_consistent" CHECK ("sprint_report_items"."done_at_start" is null or "sprint_report_items"."initial_commitment");
