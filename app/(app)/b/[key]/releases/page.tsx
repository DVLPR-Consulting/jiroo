import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ReleaseList } from "@/components/releases/release-list";
import { BacklogTopbarCreate } from "@/components/shell/backlog-topbar-create";
import { PageHeader } from "@/components/shell/page-header";
import {
  getBacklogCapabilities,
} from "@/lib/auth/accessible-backlogs";
import { checkPermission } from "@/lib/auth/authorization";
import { projectBacklogCapabilities } from "@/lib/auth/capabilities";
import { requireAppPageSession } from "@/lib/auth/session";
import { getBacklogByKeyForUser } from "@/lib/services/backlogs";
import { listUsers } from "@/lib/services/items";
import { listReleaseSummaries } from "@/lib/services/releases";
import { listStatusIdsByCategory } from "@/lib/services/statuses";

export default async function ReleasesPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ key }, query = {}] = await Promise.all([params, searchParams]);
  const showArchived = query.archived === "1";
  const session = await requireAppPageSession();
  const backlog = await getBacklogByKeyForUser(key, session.user.id);
  if (!backlog || backlog.archivedAt) notFound();

  const rawCapabilities = await getBacklogCapabilities(session.user.id, backlog.id);
  if (!rawCapabilities) notFound();
  const capabilities = projectBacklogCapabilities(rawCapabilities).releases;
  const browseUsersDecision = capabilities.manage
    ? await checkPermission({
        actorId: session.user.id,
        permission: "browse_users",
        scope: { type: "global" },
      })
    : { allowed: false };
  const [releases, rawDriverOptions, statusIds] = await Promise.all([
    listReleaseSummaries(backlog.id, { includeArchived: showArchived }),
    browseUsersDecision.allowed ? listUsers() : Promise.resolve([]),
    listStatusIdsByCategory(backlog.id),
  ]);

  return (
    <>
      <Suspense fallback={null}><BacklogTopbarCreate userId={session.user.id} backlogKey={backlog.key} /></Suspense>
      <PageHeader
        title="Releases"
        description="Planifiez les livraisons et suivez leur progression."
      />
      <ReleaseList
          actor={{ id: session.user.id, name: session.user.name }}
          backlog={{ id: backlog.id, key: backlog.key, name: backlog.name }}
          canBrowseUsers={browseUsersDecision.allowed}
          capabilities={capabilities}
          driverOptions={rawDriverOptions.map(({ id, name }) => ({ id, name }))}
          releases={releases}
          showArchived={showArchived}
          statusIds={statusIds}
        />
    </>
  );
}
