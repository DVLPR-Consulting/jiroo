CREATE TABLE "backlog_stars" (
	"user_id" text NOT NULL,
	"backlog_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "backlog_stars_user_id_backlog_id_pk" PRIMARY KEY("user_id","backlog_id")
);
--> statement-breakpoint
ALTER TABLE "backlogs" ADD COLUMN "lead_user_id" text;--> statement-breakpoint
ALTER TABLE "backlog_stars" ADD CONSTRAINT "backlog_stars_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog_stars" ADD CONSTRAINT "backlog_stars_backlog_id_backlogs_id_fk" FOREIGN KEY ("backlog_id") REFERENCES "public"."backlogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlogs" ADD CONSTRAINT "backlogs_lead_user_id_user_id_fk" FOREIGN KEY ("lead_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;