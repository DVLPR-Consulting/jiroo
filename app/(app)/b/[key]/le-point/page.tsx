import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ItemDetailDrawer } from "@/components/items/item-detail-sheet";
import { LePointView } from "@/components/le-point/le-point-view";
import { ShellBreadcrumb } from "@/components/shell/shell-breadcrumb";
import { requireAppPageSession } from "@/lib/auth/session";
import { firstSearchParam, type RawSearchParams } from "@/lib/items/view-url-params";
import { loadLePoint } from "@/lib/le-point/load";
import { lastVisitBefore, VISIT_COOKIE } from "@/lib/le-point/visit";
import { dayInZone } from "@/lib/roadmap/days";
import { loadItemDetailData } from "@/lib/services/item-detail";

export const metadata: Metadata = { title: "Le point (pilote) — Jiroo" };

/**
 * « Le point » pilot (JIR-107): a view of the project, like Jira's project
 * Summary, so the sidebar keeps the project. The backlog is read with the
 * reader's own rights, read-only; a ticket opens in the item panel in place.
 */
export default async function BacklogLePointPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams?: Promise<RawSearchParams>;
}) {
  const [{ key }, query = {}, jar] = await Promise.all([params, searchParams, cookies()]);
  const session = await requireAppPageSession();
  const data = await loadLePoint({
    userId: session.user.id,
    backlogKey: key,
    lastVisit: lastVisitBefore(jar.get(VISIT_COOKIE)?.value, dayInZone(new Date())),
  });
  if (!data) notFound();
  const itemKey = firstSearchParam(query.item) ?? null;

  return (
    <>
      <LePointView data={data} breadcrumb={<ShellBreadcrumb />} />
      <ItemDetailDrawer
        backlogKey={data.backlog.key}
        itemKey={itemKey}
        detail={itemKey
          ? loadItemDetailData({ userId: session.user.id, backlogKey: data.backlog.key, itemKey })
          : null}
      />
    </>
  );
}
