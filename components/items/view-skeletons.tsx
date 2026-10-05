import { DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

const BOARD_COLUMNS = 4;
const LIST_ROWS = 8;

function BoardSkeleton({ label = "Chargement du board" }: { label?: string }) {
  return (
    <section
      aria-busy="true"
      aria-label={label}
      className="h-full min-w-0 overflow-x-auto p-4"
      role="status"
    >
      <div className="flex min-w-max gap-3">
        {Array.from({ length: BOARD_COLUMNS }, (_, index) => (
          <div
            key={index}
            data-slot="board-skeleton-column"
            className="flex w-[296px] flex-none flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-2)] p-3"
          >
            <Skeleton className="h-5 w-28" />
            {Array.from({ length: 4 }, (_, cardIndex) => (
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
    </section>
  );
}

function ListSkeleton({ label = "Chargement de la liste" }: { label?: string }) {
  return (
    <section
      aria-busy="true"
      aria-label={label}
      className="h-full min-w-0 overflow-auto p-4"
      role="status"
    >
      <div className="min-w-[760px] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]">
        <div className="grid grid-cols-[100px_minmax(220px,1fr)_130px_90px_110px] gap-3 border-b border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-3 w-16" />
          ))}
        </div>
        {Array.from({ length: LIST_ROWS }, (_, index) => (
          <div
            key={index}
            data-slot="list-skeleton-row"
            className="grid grid-cols-[100px_minmax(220px,1fr)_130px_90px_110px] items-center gap-3 border-b border-[var(--border)] px-3 last:border-b-0"
            style={{ height: "var(--row-h)" }}
          >
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    </section>
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
        <Skeleton className="ml-auto size-7" />
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

export { BoardSkeleton, DetailPanelSkeleton, ListSkeleton };
