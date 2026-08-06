import { notFound, redirect } from "next/navigation";
import { AccessAdmin } from "@/components/admin/access-admin";
import { PermissionHelper } from "@/components/admin/permission-helper";
import { requireBacklogReadPermissionByKey } from "@/lib/auth/action-authorization";
import { checkPermission, ResourceNotFoundError } from "@/lib/auth/authorization";
import { requireAppPageSession } from "@/lib/auth/session";
import {
  listGroups,
  listPermissionSchemes,
  readBacklogAccess,
} from "@/lib/services/authorization-admin";
import { listAdminUsers } from "@/lib/services/users";

export default async function AccessPage({ params }: { params: Promise<{ key: string }> }) {
  const session = await requireAppPageSession();
  const { key } = await params;
  let resource: Awaited<ReturnType<typeof requireBacklogReadPermissionByKey>>;
  try {
    resource = await requireBacklogReadPermissionByKey({
      actorId: session.user.id,
      backlogKey: key,
      permission: "browse_backlog",
    });
  } catch (error) {
    if (error instanceof ResourceNotFoundError) notFound();
    throw error;
  }
  const [memberDecision, administerDecision, jirooDecision, browseUsersDecision] = await Promise.all([
    checkPermission({ actorId: session.user.id, permission: "manage_members", scope: { type: "backlog", backlogId: resource.backlogId } }),
    checkPermission({ actorId: session.user.id, permission: "administer_backlog", scope: { type: "backlog", backlogId: resource.backlogId } }),
    checkPermission({ actorId: session.user.id, permission: "administer_jiroo", scope: { type: "global" } }),
    checkPermission({ actorId: session.user.id, permission: "browse_users", scope: { type: "global" } }),
  ]);
  if (!memberDecision.allowed && !administerDecision.allowed) redirect(`/b/${resource.backlogKey}`);

  const [access, rawUsers, rawGroups, rawSchemes] = await Promise.all([
    readBacklogAccess(resource.backlogId),
    browseUsersDecision.allowed ? listAdminUsers() : Promise.resolve([]),
    listGroups(),
    administerDecision.allowed ? listPermissionSchemes() : Promise.resolve([]),
  ]);
  const users = rawUsers.map(({ id, name, email }) => ({ id, name, email }));
  const groups = rawGroups.map(({ id, name }) => ({ id, name }));
  const schemes = rawSchemes.map(({ id, name, version, usageCount }) => ({ id, name, version, usageCount }));

  return <div className="mx-auto max-w-4xl space-y-6 p-8"><div><h1 className="t-h1">Accès — {access.backlog.name}</h1><p className="text-sm text-muted-foreground">Utilisateurs, groupes, rôles et schéma de permissions.</p></div><AccessAdmin access={access} users={users} groups={groups} schemes={schemes} canManageMembers={memberDecision.allowed} canAdministerBacklog={administerDecision.allowed} canAdministerJiroo={jirooDecision.allowed} canBrowseUsers={browseUsersDecision.allowed} />{administerDecision.allowed && browseUsersDecision.allowed && <PermissionHelper users={users} backlogs={[access.backlog]} />}</div>;
}
