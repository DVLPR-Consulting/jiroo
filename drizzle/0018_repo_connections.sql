CREATE TYPE "public"."ref_state" AS ENUM('open', 'merged', 'closed');--> statement-breakpoint
CREATE TYPE "public"."repo_provider" AS ENUM('github', 'gitlab');--> statement-breakpoint
CREATE TABLE "repo_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"backlog_id" uuid NOT NULL,
	"provider" "repo_provider" NOT NULL,
	"instance_url" text NOT NULL,
	"repository_path" text NOT NULL,
	"secret_ciphertext" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_event_at" timestamp with time zone,
	"last_error" text,
	"last_error_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repo_webhook_deliveries" (
	"connection_id" uuid NOT NULL,
	"delivery_id" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "repo_webhook_deliveries_connection_id_delivery_id_pk" PRIMARY KEY("connection_id","delivery_id")
);
--> statement-breakpoint
ALTER TABLE "item_refs" ADD COLUMN "connection_id" uuid;--> statement-breakpoint
ALTER TABLE "item_refs" ADD COLUMN "provider" "repo_provider";--> statement-breakpoint
ALTER TABLE "item_refs" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "item_refs" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "item_refs" ADD COLUMN "author_name" text;--> statement-breakpoint
ALTER TABLE "item_refs" ADD COLUMN "state" "ref_state";--> statement-breakpoint
ALTER TABLE "item_refs" ADD COLUMN "occurred_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "repo_connections" ADD CONSTRAINT "repo_connections_backlog_id_backlogs_id_fk" FOREIGN KEY ("backlog_id") REFERENCES "public"."backlogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_connections" ADD CONSTRAINT "repo_connections_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_webhook_deliveries" ADD CONSTRAINT "repo_webhook_deliveries_connection_id_repo_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."repo_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "repo_connections_backlog_repository_idx" ON "repo_connections" USING btree ("backlog_id","provider","instance_url","repository_path");--> statement-breakpoint
CREATE INDEX "repo_webhook_deliveries_received_idx" ON "repo_webhook_deliveries" USING btree ("connection_id","received_at");--> statement-breakpoint
ALTER TABLE "item_refs" ADD CONSTRAINT "item_refs_connection_id_repo_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."repo_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "item_refs_external_idx" ON "item_refs" USING btree ("item_id","kind","provider","external_id");--> statement-breakpoint
ALTER TABLE "item_refs" ADD CONSTRAINT "item_refs_external_identity" CHECK (("item_refs"."provider" is null) = ("item_refs"."external_id" is null));