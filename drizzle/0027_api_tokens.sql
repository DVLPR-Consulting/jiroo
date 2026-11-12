-- JIR-156: personal access tokens for the REST API and the MCP server, their
-- per-minute request budget, and the source of each activity (interface,
-- API, MCP, webhook) with the token that authenticated it.
CREATE TYPE "public"."activity_source" AS ENUM('ui', 'api', 'mcp', 'webhook');--> statement-breakpoint
CREATE TYPE "public"."api_token_scope" AS ENUM('read', 'write');--> statement-breakpoint
CREATE TABLE "api_token_rate" (
	"token_id" uuid NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "api_token_rate_token_id_window_start_pk" PRIMARY KEY("token_id","window_start")
);
--> statement-breakpoint
CREATE TABLE "api_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"token_prefix" text NOT NULL,
	"scope" "api_token_scope" NOT NULL,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "source" "activity_source" DEFAULT 'ui' NOT NULL;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "token_id" uuid;--> statement-breakpoint
ALTER TABLE "api_token_rate" ADD CONSTRAINT "api_token_rate_token_id_api_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."api_tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_tokens_hash_idx" ON "api_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "api_tokens_user_idx" ON "api_tokens" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_token_id_api_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."api_tokens"("id") ON DELETE set null ON UPDATE no action;