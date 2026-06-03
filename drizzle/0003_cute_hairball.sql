DROP INDEX "items_backlog_parent_rank_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "items_backlog_parent_rank_idx" ON "items" USING btree ("backlog_id","parent_id","rank") NULLS NOT DISTINCT;