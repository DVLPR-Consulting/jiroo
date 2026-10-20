import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ItemDetailDrawer } from "@/components/items/item-detail-sheet";
import { RoadmapView } from "@/components/roadmap/roadmap-view";
import { BacklogTopbarCreate } from "@/components/shell/backlog-topbar-create";
import { PageHeader } from "@/components/shell/page-header";
import { getBacklogCapabilities } from "@/lib/auth/accessible-backlogs";
import { projectBacklogCapabilities } from "@/lib/auth/capabilities";
import { requireAppPageSession } from "@/lib/auth/session";
import { firstSearchParam, type RawSearchParams } from "@/lib/items/view-url-params";
import { dayInZone } from "@/lib/roadmap/days";
import { getBacklogByKeyForUser } from "@/lib/services/backlogs";
import { loadItemDetailData } from "@/lib/services/item-detail";
import { loadRoadmap } from "@/lib/services/roadmap";

export default async function RoadmapPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams?: Promise<RawSearchParams>;
}) {
  const [{ key }, query = {}] = await Promise.all([params, searchParams]);
  const session = await requireAppPageSession();
  const backlog = await getBacklogByKeyForUser(key, session.user.id);
  if (!backlog || backlog.archivedAt) notFound();

  const rawCapabilities = await getBacklogCapabilities(session.user.id, backlog.id);
  if (!rawCapabilities) notFound();
  const canEdit = projectBacklogCapabilities(rawCapabilities).items.edit;
  const data = await loadRoadmap(backlog.id);
  const itemKey = firstSearchParam(query.item) ?? null;

  return (
    <div className="flex h-full flex-col">
      <Suspense fallback={null}><BacklogTopbarCreate userId={session.user.id} backlogKey={backlog.key} hasItemDrawer /></Suspense>
      <PageHeader title="Roadmap" />
      <RoadmapView
        backlogKey={backlog.key}
        canEdit={canEdit}
        // The team's day, on the server and in the browser alike.
        today={dayInZone(new Date())}
        items={data.items}
        sprints={data.sprints.map((sprint) => ({
          id: sprint.id,
          name: sprint.name,
          state: sprint.state,
          start: sprint.plannedStartAt ? dayInZone(sprint.plannedStartAt) : null,
          end: sprint.plannedEndAt ? dayInZone(sprint.plannedEndAt) : null,
        }))}
        releases={data.releases}
      />
      <ItemDetailDrawer
        backlogKey={backlog.key}
        itemKey={itemKey}
        detail={itemKey
          ? loadItemDetailData({ userId: session.user.id, backlogKey: backlog.key, itemKey })
          : null}
      />
    </div>
  );
}
