ALTER TABLE "releases" ADD COLUMN "rank" text;--> statement-breakpoint
CREATE UNIQUE INDEX "releases_backlog_rank_idx" ON "releases" USING btree ("backlog_id","rank");