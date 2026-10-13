import { Suspense } from "react";
import { BacklogViewContent } from "@/components/items/backlog-view-content";
import { BacklogViewSkeleton } from "@/components/items/view-skeletons";
import { requireAppPageSession } from "@/lib/auth/session";
import { itemViewFromParam } from "@/lib/items/shell";
import { firstSearchParam, type RawSearchParams } from "@/lib/items/view-url-params";

export default async function BacklogPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  await requireAppPageSession();
  const view = itemViewFromParam(firstSearchParam((await searchParams).view));

  // Next keeps the page's loading boundary across `?view=` changes, so this
  // boundary is keyed by view: switching views shows the new view's skeleton,
  // while filter changes keep the current content until the update lands.
  return (
    <Suspense key={view} fallback={<BacklogViewSkeleton view={view} />}>
      <BacklogViewContent
        paramsPromise={params}
        searchParamsPromise={searchParams}
      />
    </Suspense>
  );
}
