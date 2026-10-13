import { notFound, redirect } from "next/navigation";
import { BacklogSettingsNav } from "@/components/admin/backlog-settings-nav";
import { RepoConnectionsAdmin } from "@/components/admin/repo-connections-admin";
import { ShellBreadcrumb } from "@/components/shell/shell-breadcrumb";
import { requireBacklogReadPermissionByKey } from "@/lib/auth/action-authorization";
import { checkPermission, ResourceNotFoundError } from "@/lib/auth/authorization";
import { requireAppPageSession } from "@/lib/auth/session";
import { getBacklogSummary } from "@/lib/services/backlogs";
import { listRepoConnections } from "@/lib/services/repo-connections";

/** Backlog settings → Développement: repositories connected by webhook (JIR-95). */
export default async function DevelopmentSettingsPage({ params }: { params: Promise<{ key: string }> }) {
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
  const [administerDecision, createBacklogsDecision] = await Promise.all([
    checkPermission({ actorId: session.user.id, permission: "administer_backlog", scope: { type: "backlog", backlogId: resource.backlogId } }),
    // Administration → Backlogs opens with create_backlogs: the breadcrumb links it only then (JIR-85).
    checkPermission({ actorId: session.user.id, permission: "create_backlogs", scope: { type: "global" } }),
  ]);
  if (!administerDecision.allowed) redirect(`/b/${resource.backlogKey}`);

  const [backlog, connections] = await Promise.all([
    getBacklogSummary(resource.backlogId),
    listRepoConnections(resource.backlogId),
  ]);
  if (!backlog) notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <div className="space-y-1">
        <ShellBreadcrumb canOpenAdmin={createBacklogsDecision.allowed} />
        <h1 className="t-h1">Développement — {backlog.name}</h1>
        <p className="text-sm text-muted-foreground">
          Dépôts GitHub et GitLab reliés par webhook : leurs branches, commits et pull / merge requests apparaissent sur les tickets dont ils citent la clé.
        </p>
      </div>
      <BacklogSettingsNav backlogKey={resource.backlogKey} current="development" canAdministerBacklog />
      <RepoConnectionsAdmin
        backlogId={resource.backlogId}
        backlogKey={resource.backlogKey}
        connections={connections.map(({ id, provider, instanceUrl, repositoryPath, enabled, lastEventAt, lastError, lastErrorAt }) => ({
          id, provider, instanceUrl, repositoryPath, enabled, lastEventAt, lastError, lastErrorAt,
        }))}
      />
    </div>
  );
}
