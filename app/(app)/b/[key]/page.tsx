import { Suspense } from "react";
import { BacklogViewContent } from "@/components/items/backlog-view-content";
import { BoardSkeleton, ListSkeleton } from "@/components/items/view-skeletons";
import { firstSearchParam, type RawSearchParams } from "@/lib/items/view-url-params";

const VIEWS = ["board", "list", "tree"] as const;
type View = (typeof VIEWS)[number];

export default async function BacklogPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const requestedView = firstSearchParam((await searchParams).view);
  const view: View = VIEWS.includes(requestedView as View)
    ? (requestedView as View)
    : "board";
  const fallback =
    view === "board" ? (
      <BoardSkeleton />
    ) : (
      <ListSkeleton label={view === "tree" ? "Chargement de l’arbre" : undefined} />
    );

  return (
    <Suspense fallback={fallback}>
      <BacklogViewContent
        paramsPromise={params}
        searchParamsPromise={searchParams}
      />
    </Suspense>
  );
}
