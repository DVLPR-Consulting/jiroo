import type { ComponentType } from "react";
import { X } from "lucide-react";
import { DialogClose, DialogTitle } from "@/components/ui/dialog";
import { PageHeaderSkeleton } from "@/components/skeletons/page-skeletons";
import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";
import type { ItemViewId } from "@/lib/items/shell";

const BOARD_COLUMNS = 4;
const LIST_ROWS = 8;
const TREE_DEPTHS = [0, 1, 2, 2, 1, 2, 0, 1];
// Selection column, then `LIST_COLUMNS` (lib/items/table-layout.ts) in order.
const LIST_GRID =
  "grid grid-cols-[2.5rem_8rem_minmax(14rem,1fr)_10rem_4rem_6rem_12rem_8rem_11rem] items-center";

const VIEW_LABELS: Record<ItemViewId, string> = {
  backlog: "Chargement du backlog",
  board: "Chargement du board",
  list: "Chargement de la liste",
  tree: "Chargement de l’arbre",
};

/** Mirrors `FilterBar`: search field, assignee avatars, facets, result count. */
function FilterBarSkeleton() {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 pb-3 sm:px-6">
      <Skeleton className="h-8 w-44 sm:w-52" />
      <div className="flex items-center">
        <Skeleton className="size-7 rounded-full" />
        <Skeleton className="-ml-0.5 size-7 rounded-full" />
      </div>
      <span aria-hidden="true" className="hidden h-5 w-px bg-border sm:block" />
      <Skeleton className="h-8 w-[70px]" />
      <Skeleton className="h-8 w-[78px]" />
      <Skeleton className="h-8 w-[80px]" />
      <Skeleton className="h-8 w-[72px]" />
      <Skeleton className="ml-auto h-3.5 w-16" />
    </div>
  );
}

function BoardBody() {
  return (
    <>
      {/* The active sprint's header above its columns. */}
      <div className="space-y-2 border-b border-border px-4 py-3">
        <Skeleton className="h-[22px] w-44" />
        <Skeleton className="h-3 w-56" />
      </div>
      <div className="min-w-0 flex-1 overflow-x-auto p-4">
        <div className="flex min-w-max gap-3">
          {Array.from({ length: BOARD_COLUMNS }, (_, index) => (
            <div
              key={index}
              data-slot="board-skeleton-column"
              className="flex w-[296px] flex-none flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-2)] p-3"
            >
              <Skeleton className="h-5 w-28 bg-[var(--border)]" />
              {Array.from({ length: 4 - (index % 3) }, (_, cardIndex) => (
                <div
                  key={cardIndex}
                  className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-xs)]"
                  style={{ padding: "var(--card-pad)" }}
                >
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function ListBody() {
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      {/* « Colonnes » sits above the table. */}
      <div className="flex justify-end border-b border-border p-2">
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="min-w-[82rem]">
        <div className={`${LIST_GRID} h-8 gap-3 border-b border-border bg-[var(--surface-2)] px-3`}>
          <span />
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-2.5 w-14 bg-[var(--border)]" />
          ))}
        </div>
        {Array.from({ length: LIST_ROWS }, (_, index) => (
          <div
            key={index}
            data-slot="list-skeleton-row"
            className={`${LIST_GRID} gap-3 border-b border-border px-3`}
            style={{ height: "var(--row-h)" }}
          >
            <Skeleton className="mx-auto size-4" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className={index % 2 === 0 ? "h-3 w-4/5" : "h-3 w-3/5"} />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-6" />
            <Skeleton className="h-3 w-8" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}

function TreeBody() {
  return (
    <div className="min-h-0 flex-1 overflow-auto py-1">
      {TREE_DEPTHS.map((depth, index) => (
        <div
          key={index}
          data-slot="tree-skeleton-row"
          className="flex items-center gap-2 py-2 pr-3"
          style={{ paddingLeft: 8 + depth * 20 }}
        >
          <Skeleton className="size-4" />
          <Skeleton className="size-4" />
          <Skeleton className="h-3 w-14" />
          <Skeleton className={index % 2 === 0 ? "h-3.5 w-72" : "h-3.5 w-52"} />
        </div>
      ))}
    </div>
  );
}

function BacklogBody() {
  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <div className="flex flex-col gap-4 p-3 sm:p-4">
        {[3, 5].map((rows, index) => (
          <div
            key={index}
            data-slot="backlog-skeleton-section"
            className="rounded-[var(--radius-lg)] border border-border bg-[var(--surface)]"
          >
            {/* Sprint (then Backlog) header: chevron, name, summary, action. */}
            <div className="flex items-center gap-2.5 border-b border-border px-3 py-2.5 sm:px-3.5">
              <Skeleton className="size-6" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="ml-auto h-8 w-32" />
            </div>
            {Array.from({ length: rows }, (_, rowIndex) => (
              <div
                key={rowIndex}
                className="flex items-center gap-2 border-b border-border px-3 last:border-b-0"
                style={{ height: "var(--row-h)" }}
              >
                <Skeleton className="size-4" />
                <Skeleton className="h-3 w-14" />
                <Skeleton className={rowIndex % 2 === 0 ? "h-3.5 w-80" : "h-3.5 w-56"} />
                <Skeleton className="ml-auto h-5 w-20 rounded-full" />
                <Skeleton className="size-6 rounded-full" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

const VIEW_BODIES: Record<ItemViewId, ComponentType> = {
  backlog: BacklogBody,
  board: BoardBody,
  list: ListBody,
  tree: TreeBody,
};

/**
 * A backlog item view while it loads (JIR-84): the page header, the filter
 * bar, then the requested view's own shape, as laid out by
 * `BacklogViewContent`.
 */
function BacklogViewSkeleton({ view }: { view: ItemViewId }) {
  const Body = VIEW_BODIES[view];
  return (
    <SkeletonRegion label={VIEW_LABELS[view]} name={view} className="flex h-full flex-col">
      <PageHeaderSkeleton
        titleClassName="w-24"
        actions={
          <>
            {view === "board" ? <Skeleton className="h-8 w-24" /> : null}
            <Skeleton className="h-8 w-44" />
          </>
        }
      />
      <FilterBarSkeleton />
      <Body />
    </SkeletonRegion>
  );
}

/**
 * Detail body placeholder streamed inside `ItemDetailSheet` while the item
 * loads: the drawer frame is already open, so only its content is swapped.
 */
function DetailPanelSkeleton({
  label = "Chargement du panneau de détail",
}: {
  label?: string;
}) {
  return (
    <div
      aria-busy="true"
      aria-label={label}
      role="status"
      className="flex min-h-0 flex-1 flex-col"
    >
      <DialogTitle className="sr-only">{label}</DialogTitle>
      <div className="flex flex-none items-center gap-2 border-b border-[var(--border)] px-4 py-3">
        <Skeleton className="size-4" />
        <Skeleton className="h-3 w-16" />
        {/* A real close control: on phones the drawer covers the whole
            screen, so the load must stay cancellable by touch (JIR-77). */}
        <DialogClose asChild>
          <button
            type="button"
            aria-label="Fermer"
            className="ml-auto rounded p-1 text-muted-foreground hover:bg-[var(--muted)]"
          >
            <X className="size-4" />
          </button>
        </DialogClose>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-1">
        <div className="flex min-w-0 flex-col gap-4 p-5">
          <Skeleton className="h-7 w-3/4" />
          <div className="flex gap-2 border-b border-[var(--border)] pb-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-16" />
          </div>
          <Skeleton className="h-28 w-full" />
        </div>
        <div className="flex flex-col gap-5 border-t border-[var(--border)] bg-[var(--surface-2)] p-5 lg:border-t-0 lg:border-l">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="flex flex-col gap-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-6 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export { BacklogViewSkeleton, DetailPanelSkeleton };
