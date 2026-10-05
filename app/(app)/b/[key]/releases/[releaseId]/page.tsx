import { notFound } from "next/navigation";
import { z } from "zod";
import { ReleaseDetail } from "@/components/releases/release-detail";
import { BacklogNavBar } from "@/components/shell/view-tabs";
import { getBacklogCapabilities } from "@/lib/auth/accessible-backlogs";
import { checkPermission } from "@/lib/auth/authorization";
import { projectBacklogCapabilities } from "@/lib/auth/capabilities";
import { requireAppPageSession } from "@/lib/auth/session";
import { getBacklogByKeyForUser } from "@/lib/services/backlogs";
import { listUsers } from "@/lib/services/items";
import {
  getReleaseDetail,
  listPublicationSnapshotItems,
  listReleaseEvents,
  listReleaseScopeItems,
  listReleaseSummaries,
  resolveReleasePublicationId,
} from "@/lib/services/releases";
import { listStatusIdsByCategory } from "@/lib/services/statuses";

const PAGE_SIZE = 20;
type SearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function pageNumber(value: string | string[] | undefined) {
  const parsed = Number(firstValue(value));
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
}

function enumValue<T extends string>(
  value: string | string[] | undefined,
  values: readonly T[],
): T | null {
  const candidate = firstValue(value);
  return candidate && values.includes(candidate as T) ? candidate as T : null;
}

export default async function ReleaseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string; releaseId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const [{ key, releaseId }, query] = await Promise.all([params, searchParams]);
  if (!z.uuid().safeParse(releaseId).success) notFound();

  const session = await requireAppPageSession();
  const backlog = await getBacklogByKeyForUser(key, session.user.id);
  if (!backlog || backlog.archivedAt) notFound();

  const rawCapabilities = await getBacklogCapabilities(session.user.id, backlog.id);
  if (!rawCapabilities) notFound();
  const capabilities = projectBacklogCapabilities(rawCapabilities).releases;

  const release = await getReleaseDetail(backlog.id, releaseId);
  if (!release) notFound();

  const browseUsersDecision = capabilities.manage
    ? await checkPermission({
        actorId: session.user.id,
        permission: "browse_users",
        scope: { type: "global" },
      })
    : { allowed: false };
  const scopePage = pageNumber(query.scopePage);
  const scopeStatus = enumValue(query.scopeStatus, ["todo", "in_progress", "done"] as const);
  const scopeEstimate = enumValue(query.scopeEstimate, ["estimated", "unestimated"] as const);
  const eventPage = pageNumber(query.eventPage);
  const requestedSnapshot = firstValue(query.snapshot);
  const preferredPublicationId = requestedSnapshot
    && z.uuid().safeParse(requestedSnapshot).success
    ? requestedSnapshot
    : null;
  const [
    scopeResult,
    eventResult,
    releaseSummaries,
    rawDriverOptions,
    statusIds,
    publicationId,
  ] = await Promise.all([
    listReleaseScopeItems({
      backlogId: backlog.id,
      releaseId,
      page: scopePage,
      pageSize: PAGE_SIZE,
      statusCategory: scopeStatus,
      estimate: scopeEstimate,
    }),
    listReleaseEvents({
      backlogId: backlog.id,
      releaseId,
      page: eventPage,
      pageSize: PAGE_SIZE,
    }),
    capabilities.manage
      ? listReleaseSummaries(backlog.id, { includeArchived: true })
      : Promise.resolve([]),
    browseUsersDecision.allowed ? listUsers() : Promise.resolve([]),
    listStatusIdsByCategory(backlog.id),
    resolveReleasePublicationId({
      backlogId: backlog.id,
      releaseId,
      preferredPublicationId,
    }),
  ]);

  const snapshotPage = preferredPublicationId === publicationId
    ? pageNumber(query.snapshotPage)
    : 1;
  const snapshotResult = publicationId
    ? await listPublicationSnapshotItems({
        backlogId: backlog.id,
        publicationId,
        page: snapshotPage,
        pageSize: PAGE_SIZE,
      })
    : null;

  return (
    <>
      <BacklogNavBar active="releases" backlogKey={backlog.key} />
      <ReleaseDetail
        backlog={{ id: backlog.id, key: backlog.key, name: backlog.name }}
        release={{
          ...release,
          createdAt: release.createdAt.toISOString(),
          updatedAt: release.updatedAt.toISOString(),
        }}
        actor={{ id: session.user.id, name: session.user.name }}
        driverOptions={rawDriverOptions.map(({ id, name }) => ({ id, name }))}
        canBrowseUsers={browseUsersDecision.allowed}
        capabilities={capabilities}
        statusIds={statusIds}
        destinations={releaseSummaries
          .filter(
            (candidate) => candidate.id !== releaseId && !candidate.archived && !candidate.released,
          )
          .map(({ id, name }) => ({ id, name }))}
        mergeTargets={releaseSummaries
          .filter((candidate) => candidate.id !== releaseId && !candidate.archived)
          .map(({ id, name, revision, released }) => ({ id, name, revision, released }))}
        scope={{ page: scopePage, total: scopeResult.total, rows: scopeResult.rows }}
        scopeFilters={{ statusCategory: scopeStatus, estimate: scopeEstimate }}
        events={{
          page: eventPage,
          total: eventResult.total,
          rows: eventResult.rows.map((event) => ({
            id: event.id,
            publicationId: event.publicationId,
            actorName: event.actor.name,
            action: event.action,
            createdAt: event.createdAt.toISOString(),
          })),
        }}
        snapshot={snapshotResult && publicationId
          ? {
              publicationId,
              page: snapshotPage,
              total: snapshotResult.total,
              rows: snapshotResult.rows,
            }
          : null}
      />
    </>
  );
}
