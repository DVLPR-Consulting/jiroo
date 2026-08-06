CREATE TYPE "public"."access_mode" AS ENUM('simple', 'advanced');--> statement-breakpoint
CREATE TYPE "public"."permission_principal" AS ENUM('user', 'group', 'project_role', 'authenticated_user');--> statement-breakpoint
CREATE TYPE "public"."permission_scope" AS ENUM('global', 'backlog');--> statement-breakpoint
CREATE TYPE "public"."role_actor_type" AS ENUM('user', 'group');--> statement-breakpoint
CREATE TABLE "backlog_permission_configs" (
	"backlog_id" uuid PRIMARY KEY NOT NULL,
	"permission_scheme_id" uuid NOT NULL,
	"access_mode" "access_mode" DEFAULT 'simple' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backlog_role_actors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"backlog_id" uuid NOT NULL,
	"project_role_id" uuid NOT NULL,
	"actor_type" "role_actor_type" NOT NULL,
	"user_id" text,
	"group_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "backlog_role_actors_principal_consistent" CHECK ((
        ("backlog_role_actors"."actor_type" = 'user' and "backlog_role_actors"."user_id" is not null and "backlog_role_actors"."group_id" is null)
        or ("backlog_role_actors"."actor_type" = 'group' and "backlog_role_actors"."group_id" is not null and "backlog_role_actors"."user_id" is null)
      ))
);
--> statement-breakpoint
CREATE TABLE "group_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permission_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" "permission_scope" NOT NULL,
	"permission_scheme_id" uuid,
	"permission_key" text NOT NULL,
	"principal_type" "permission_principal" NOT NULL,
	"user_id" text,
	"group_id" uuid,
	"project_role_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "permission_grants_scope_consistent" CHECK ((
        ("permission_grants"."scope" = 'global' and "permission_grants"."permission_scheme_id" is null and "permission_grants"."principal_type" in ('user', 'group'))
        or ("permission_grants"."scope" = 'backlog' and "permission_grants"."permission_scheme_id" is not null)
      )),
	CONSTRAINT "permission_grants_principal_consistent" CHECK ((
        ("permission_grants"."principal_type" = 'user' and "permission_grants"."user_id" is not null and "permission_grants"."group_id" is null and "permission_grants"."project_role_id" is null)
        or ("permission_grants"."principal_type" = 'group' and "permission_grants"."group_id" is not null and "permission_grants"."user_id" is null and "permission_grants"."project_role_id" is null)
        or ("permission_grants"."principal_type" = 'project_role' and "permission_grants"."project_role_id" is not null and "permission_grants"."user_id" is null and "permission_grants"."group_id" is null)
        or ("permission_grants"."principal_type" = 'authenticated_user' and "permission_grants"."user_id" is null and "permission_grants"."group_id" is null and "permission_grants"."project_role_id" is null)
      ))
);
--> statement-breakpoint
CREATE TABLE "permission_schemes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"protected" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "permission_schemes_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "project_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"protected" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_roles_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "security_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text,
	"actor_label" text NOT NULL,
	"action" text NOT NULL,
	"scope" "permission_scope" NOT NULL,
	"backlog_id" uuid,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"old_value" jsonb,
	"new_value" jsonb,
	"request_correlation_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"protected" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_groups_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "backlog_permission_configs" ADD CONSTRAINT "backlog_permission_configs_backlog_id_backlogs_id_fk" FOREIGN KEY ("backlog_id") REFERENCES "public"."backlogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog_permission_configs" ADD CONSTRAINT "backlog_permission_configs_permission_scheme_id_permission_schemes_id_fk" FOREIGN KEY ("permission_scheme_id") REFERENCES "public"."permission_schemes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog_role_actors" ADD CONSTRAINT "backlog_role_actors_backlog_id_backlogs_id_fk" FOREIGN KEY ("backlog_id") REFERENCES "public"."backlogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog_role_actors" ADD CONSTRAINT "backlog_role_actors_project_role_id_project_roles_id_fk" FOREIGN KEY ("project_role_id") REFERENCES "public"."project_roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog_role_actors" ADD CONSTRAINT "backlog_role_actors_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backlog_role_actors" ADD CONSTRAINT "backlog_role_actors_group_id_user_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."user_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_user_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."user_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_grants" ADD CONSTRAINT "permission_grants_permission_scheme_id_permission_schemes_id_fk" FOREIGN KEY ("permission_scheme_id") REFERENCES "public"."permission_schemes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_grants" ADD CONSTRAINT "permission_grants_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_grants" ADD CONSTRAINT "permission_grants_group_id_user_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."user_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "permission_grants" ADD CONSTRAINT "permission_grants_project_role_id_project_roles_id_fk" FOREIGN KEY ("project_role_id") REFERENCES "public"."project_roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_audit_events" ADD CONSTRAINT "security_audit_events_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_audit_events" ADD CONSTRAINT "security_audit_events_backlog_id_backlogs_id_fk" FOREIGN KEY ("backlog_id") REFERENCES "public"."backlogs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "backlog_permission_configs_scheme_idx" ON "backlog_permission_configs" USING btree ("permission_scheme_id");--> statement-breakpoint
CREATE UNIQUE INDEX "backlog_role_actors_user_idx" ON "backlog_role_actors" USING btree ("backlog_id","project_role_id","user_id") WHERE "backlog_role_actors"."actor_type" = 'user';--> statement-breakpoint
CREATE UNIQUE INDEX "backlog_role_actors_group_idx" ON "backlog_role_actors" USING btree ("backlog_id","project_role_id","group_id") WHERE "backlog_role_actors"."actor_type" = 'group';--> statement-breakpoint
CREATE UNIQUE INDEX "group_members_group_user_idx" ON "group_members" USING btree ("group_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "permission_grants_global_user_idx" ON "permission_grants" USING btree ("permission_key","user_id") WHERE "permission_grants"."scope" = 'global' and "permission_grants"."principal_type" = 'user';--> statement-breakpoint
CREATE UNIQUE INDEX "permission_grants_global_group_idx" ON "permission_grants" USING btree ("permission_key","group_id") WHERE "permission_grants"."scope" = 'global' and "permission_grants"."principal_type" = 'group';--> statement-breakpoint
CREATE UNIQUE INDEX "permission_grants_backlog_user_idx" ON "permission_grants" USING btree ("permission_scheme_id","permission_key","user_id") WHERE "permission_grants"."scope" = 'backlog' and "permission_grants"."principal_type" = 'user';--> statement-breakpoint
CREATE UNIQUE INDEX "permission_grants_backlog_group_idx" ON "permission_grants" USING btree ("permission_scheme_id","permission_key","group_id") WHERE "permission_grants"."scope" = 'backlog' and "permission_grants"."principal_type" = 'group';--> statement-breakpoint
CREATE UNIQUE INDEX "permission_grants_backlog_project_role_idx" ON "permission_grants" USING btree ("permission_scheme_id","permission_key","project_role_id") WHERE "permission_grants"."scope" = 'backlog' and "permission_grants"."principal_type" = 'project_role';--> statement-breakpoint
CREATE UNIQUE INDEX "permission_grants_backlog_authenticated_user_idx" ON "permission_grants" USING btree ("permission_scheme_id","permission_key") WHERE "permission_grants"."scope" = 'backlog' and "permission_grants"."principal_type" = 'authenticated_user';