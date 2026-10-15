ALTER TABLE "permission_grants" DROP CONSTRAINT "permission_grants_scope_consistent";--> statement-breakpoint
CREATE UNIQUE INDEX "permission_grants_global_authenticated_user_idx" ON "permission_grants" USING btree ("permission_key") WHERE "permission_grants"."scope" = 'global' and "permission_grants"."principal_type" = 'authenticated_user';--> statement-breakpoint
ALTER TABLE "permission_grants" ADD CONSTRAINT "permission_grants_scope_consistent" CHECK ((
        ("permission_grants"."scope" = 'global' and "permission_grants"."permission_scheme_id" is null and "permission_grants"."principal_type" in ('user', 'group'))
        or ("permission_grants"."scope" = 'global' and "permission_grants"."permission_scheme_id" is null and "permission_grants"."principal_type" = 'authenticated_user' and "permission_grants"."permission_key" = 'browse_users')
        or ("permission_grants"."scope" = 'backlog' and "permission_grants"."permission_scheme_id" is not null)
      ));--> statement-breakpoint
-- Jira grants "Browse users and groups" to every product user by default:
-- without it nobody but administrators can pick an assignee (JIR-103).
INSERT INTO "permission_grants" ("scope", "permission_key", "principal_type")
VALUES ('global', 'browse_users', 'authenticated_user')
ON CONFLICT ("permission_key") WHERE "scope" = 'global' AND "principal_type" = 'authenticated_user' DO NOTHING;
