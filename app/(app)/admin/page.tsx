import { redirect } from "next/navigation";
import { checkPermission } from "@/lib/auth/authorization";
import { requireAppPageSession } from "@/lib/auth/session";
import { listAdminBacklogsForUser } from "@/lib/services/backlogs";
import { listUsers } from "@/lib/services/items";
import { listAdminUsers } from "@/lib/services/users";
import {
  listGroups,
  listGlobalPermissionGrants,
  listPermissionSchemes,
  listProjectRoles,
} from "@/lib/services/authorization-admin";
import { AdminTabs, type AdminTab } from "@/components/admin/admin-tabs";
import { ShellBreadcrumb } from "@/components/shell/shell-breadcrumb";

const ADMIN_TABS = ["backlogs", "users", "groups", "roles", "schemes"] as const;

function requestedTab(value: string | string[] | undefined): AdminTab {
  return typeof value === "string" && ADMIN_TABS.includes(value as AdminTab)
    ? (value as AdminTab)
    : "backlogs";
}

const TAB_PERMISSION = {
  backlogs: "create_backlogs",
  users: "manage_users_groups",
  groups: "manage_users_groups",
  roles: "manage_users_groups",
  schemes: "administer_jiroo",
} as const;

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[]; scheme?: string | string[] }>;
}) {
  const session = await requireAppPageSession();
  const { tab, scheme } = await searchParams;
  const activeTab = requestedTab(tab);
  const decision = await checkPermission({
    actorId: session.user.id,
    permission: TAB_PERMISSION[activeTab],
    scope: { type: "global" },
  });
  if (!decision.allowed) redirect("/");
  const browseUsersDecision = ["backlogs", "users", "groups", "schemes"].includes(activeTab)
    ? await checkPermission({
        actorId: session.user.id,
        permission: "browse_users",
        scope: { type: "global" },
      })
    : { allowed: false };
  if (activeTab === "users" && !browseUsersDecision.allowed) redirect("/");

  const data = activeTab === "backlogs"
    ? await (async () => {
        // The lead picker lists users only with « Parcourir les utilisateurs »,
        // like the release driver picker (JIR-82).
        const [backlogs, users] = await Promise.all([
          listAdminBacklogsForUser(session.user.id),
          browseUsersDecision.allowed ? listUsers() : Promise.resolve(null),
        ]);
        return {
          tab: "backlogs" as const,
          backlogs,
          leadOptions: users
            ?.map(({ id, name }) => ({ id, name }))
            .sort((left, right) => left.name.localeCompare(right.name, "fr")),
        };
      })()
    : activeTab === "users"
      ? await (async () => {
          const [rawUsers, recoveryDecision] = await Promise.all([
            listAdminUsers(),
            checkPermission({ actorId: session.user.id, permission: "administer_jiroo", scope: { type: "global" } }),
          ]);
          return {
            tab: "users" as const,
            users: rawUsers.map(({ id, name, email }) => ({ id, name, email })),
            currentUserId: session.user.id,
            canRecoverAccounts: recoveryDecision.allowed,
          };
        })()
      : activeTab === "groups"
        ? await (async () => {
            const globalDecision = await checkPermission({ actorId: session.user.id, permission: "administer_jiroo", scope: { type: "global" } });
            const [groups, rawUsers, globalGrants] = await Promise.all([
              listGroups(session.user.id),
              browseUsersDecision.allowed ? listAdminUsers() : Promise.resolve([]),
              listGlobalPermissionGrants(),
            ]);
            return { tab: "groups" as const, groups, users: rawUsers.map(({ id, name }) => ({ id, name })), globalGrants, canAdministerGlobals: globalDecision.allowed };
          })()
        : activeTab === "roles"
          ? { tab: "roles" as const, roles: await listProjectRoles(session.user.id) }
          : await (async () => {
              const [schemes, rawUsers, rawGroups, rawRoles] = await Promise.all([
                listPermissionSchemes(),
                browseUsersDecision.allowed ? listAdminUsers() : Promise.resolve([]),
                listGroups(session.user.id),
                listProjectRoles(session.user.id),
              ]);
              return {
                tab: "schemes" as const,
                schemes,
                users: rawUsers.map(({ id, name }) => ({ id, name })),
                groups: rawGroups.map(({ id, name }) => ({ id, name })),
                roles: rawRoles.map(({ id, name, key }) => ({ id, name, key })),
                initialSchemeId: typeof scheme === "string" ? scheme : undefined,
              };
            })();

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <div className="space-y-1">
        <ShellBreadcrumb />
        <h1 className="t-h1">Administration</h1>
        <p className="text-sm text-muted-foreground">
          Gestion des backlogs, des identités et des schémas d’accès.
        </p>
      </div>
      <AdminTabs
        activeTab={activeTab}
        data={data}
      />
    </div>
  );
}
