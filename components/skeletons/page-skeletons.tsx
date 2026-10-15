import type { ReactNode } from "react";
import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Route placeholders (JIR-84): one per page type, laid out with the page's own
 * containers so nothing jumps when the content streams in (Jira's model).
 * Shapes only — titles and data stay out until they are known.
 */

/** Breadcrumb, `t-h1` title and optional description lines of a page header. */
function PageTitleSkeleton({
  titleClassName = "w-40",
  description = false,
}: {
  titleClassName?: string;
  description?: boolean;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <div className="flex h-5 items-center">
        <Skeleton className="h-3 w-32" />
      </div>
      <Skeleton className={cn("h-[26px]", titleClassName)} />
      {description ? (
        <div className="flex h-5 items-center">
          <Skeleton className="h-3.5 w-72 max-w-full" />
        </div>
      ) : null}
    </div>
  );
}

/** Mirrors `PageHeader`: title block on the left, page actions on the right. */
function PageHeaderSkeleton({
  className,
  titleClassName,
  description,
  actions,
}: {
  className?: string;
  titleClassName?: string;
  description?: boolean;
  actions?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end justify-between gap-x-4 gap-y-2 px-4 pt-4 pb-3 sm:px-6",
        className,
      )}
    >
      <PageTitleSkeleton titleClassName={titleClassName} description={description} />
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/**
 * Rows shaped like the shared item row (JIR-93): optional checkbox, type,
 * key, title, then the status (and an avatar) at the end; `trailing` adds
 * the context's own cells (deletion date, actions…).
 */
function ItemRowsSkeleton({
  rows,
  trailing = 0,
  selectable = false,
  avatar = false,
  slot = "item-row-skeleton",
}: {
  rows: number;
  trailing?: number;
  selectable?: boolean;
  avatar?: boolean;
  slot?: string;
}) {
  return Array.from({ length: rows }, (_, index) => (
    <div
      key={index}
      data-slot={slot}
      className="flex items-center gap-2.5 border-b border-border pl-2 pr-3 last:border-b-0 sm:pr-3.5"
      style={{ height: "var(--row-h)" }}
    >
      {selectable ? <Skeleton className="mx-1 size-4 flex-none" /> : null}
      <Skeleton className="size-4 flex-none" />
      <Skeleton className="h-3 w-14 flex-none" />
      <Skeleton className={cn("h-3.5 min-w-0", index % 2 === 0 ? "w-1/2" : "w-1/3")} />
      <span className="flex-1" />
      <Skeleton className="hidden h-5 w-20 rounded-full sm:block" />
      {Array.from({ length: trailing }, (_, cell) => (
        <Skeleton key={cell} className="hidden h-3 w-16 sm:block" />
      ))}
      {avatar ? <Skeleton className="size-[22px] flex-none rounded-full" /> : null}
    </div>
  ));
}

const HOME_COLUMNS =
  "sm:grid-cols-[2rem_minmax(0,1.5fr)_6.5rem_minmax(0,1.4fr)_minmax(0,1fr)]";

/** « Backlogs » home: the overview table (JIR-82). */
function HomeSkeleton() {
  return (
    <SkeletonRegion
      label="Chargement des backlogs"
      name="home"
      className="mx-auto w-full max-w-5xl px-4 pt-4 pb-8 sm:px-6 sm:pt-6"
    >
      <div className="mb-4 flex items-center gap-3">
        <Skeleton className="h-[26px] w-28" />
        <Skeleton className="h-3.5 w-5" />
      </div>
      <div className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-[var(--surface)]">
        <div className={`hidden gap-x-3 border-b border-border bg-[var(--surface-2)] px-4 py-2.5 sm:grid ${HOME_COLUMNS}`}>
          <span />
          <Skeleton className="h-3 w-16 bg-[var(--border)]" />
          <Skeleton className="h-3 w-20 bg-[var(--border)]" />
          <Skeleton className="h-3 w-20 bg-[var(--border)]" />
          <Skeleton className="h-3 w-24 bg-[var(--border)]" />
        </div>
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            data-slot="home-skeleton-row"
            className={`grid grid-cols-[2rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 border-b border-border px-3 py-3 last:border-b-0 sm:px-4 ${HOME_COLUMNS}`}
          >
            <div className="flex size-8 items-center justify-center">
              <Skeleton className="size-4" />
            </div>
            <div className="flex items-center gap-2.5">
              <Skeleton className="size-2.5 rounded-full" />
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-4 w-10" />
            </div>
            <Skeleton className="col-start-2 h-3.5 w-8 sm:col-start-auto" />
            <div className="col-start-2 flex flex-col gap-1.5 sm:col-start-auto">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-1 w-full max-w-48" />
            </div>
            <div className="col-start-2 flex items-center gap-2 sm:col-start-auto">
              <Skeleton className="size-6 rounded-full" />
              <Skeleton className="h-3.5 w-24" />
            </div>
          </div>
        ))}
      </div>
    </SkeletonRegion>
  );
}

/**
 * The Backlog's section card (JIR-97) while it loads: header (select-all,
 * chevron, backlog badge, name, summary, points, a second line) above rows.
 */
function SectionCardSkeleton({
  rows,
  slot = "section-card-skeleton",
  selectable = false,
  badge = false,
  points = false,
  meta,
  trailing,
  avatar,
  rowSlot,
}: {
  rows: number;
  slot?: string;
  selectable?: boolean;
  badge?: boolean;
  points?: boolean;
  meta?: ReactNode;
  trailing?: number;
  avatar?: boolean;
  rowSlot?: string;
}) {
  return (
    <div
      data-slot={slot}
      className="rounded-[var(--radius-lg)] border border-border bg-[var(--surface)]"
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-border px-3 py-2.5 sm:px-3.5">
        {selectable ? <Skeleton className="mx-1 size-4" /> : null}
        <Skeleton className="size-6" />
        {badge ? <Skeleton className="h-[18px] w-10" /> : null}
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3.5 w-36" />
        {points ? <Skeleton className="ml-auto h-5 w-24 rounded-full" /> : null}
        {meta}
      </div>
      <ItemRowsSkeleton
        rows={rows}
        selectable={selectable}
        trailing={trailing}
        avatar={avatar}
        slot={rowSlot}
      />
    </div>
  );
}

/** « Mes items »: one Backlog card per backlog of assigned items. */
function MineSkeleton() {
  return (
    <SkeletonRegion label="Chargement de mes items" name="mine" className="mx-auto max-w-3xl p-8">
      <div className="mb-6">
        <PageTitleSkeleton titleClassName="w-32" />
      </div>
      <div className="flex flex-col gap-4">
        {[4, 2].map((rows, index) => (
          <SectionCardSkeleton key={index} rows={rows} badge points trailing={1} />
        ))}
      </div>
    </SkeletonRegion>
  );
}

/** « Corbeille »: bordered header, then one Backlog card per backlog. */
function TrashSkeleton() {
  return (
    <SkeletonRegion label="Chargement de la corbeille" name="trash" className="flex h-full flex-col">
      <div className="space-y-1 border-b border-border px-6 py-4">
        <div className="flex h-5 items-center">
          <Skeleton className="h-3 w-32" />
        </div>
        <Skeleton className="h-[26px] w-32" />
        <div className="flex h-5 items-center">
          <Skeleton className="h-3.5 w-28" />
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-4 p-3 sm:p-4">
        {[3, 2].map((rows, index) => (
          <SectionCardSkeleton key={index} rows={rows} badge trailing={2} />
        ))}
      </div>
    </SkeletonRegion>
  );
}

/** « Guide d’utilisation »: header, table of contents, article. */
function HelpSkeleton() {
  return (
    <SkeletonRegion
      label="Chargement du guide"
      name="help"
      className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:py-8"
    >
      <div className="mb-6">
        <PageTitleSkeleton titleClassName="w-56" description />
      </div>
      <div className="grid gap-8 lg:grid-cols-[200px_minmax(0,1fr)]">
        <div className="hidden space-y-2 px-2 lg:block">
          <Skeleton className="mb-3 h-3 w-16" />
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className={cn("h-3.5", index % 3 === 0 ? "w-32" : "w-24")} />
          ))}
        </div>
        <Skeleton className="h-10 w-full rounded-[var(--radius-md)] lg:hidden" />
        <div className="min-w-0 max-w-3xl space-y-3">
          <Skeleton className="h-5 w-48" />
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className={cn("h-3.5", index === 5 ? "w-2/3" : "w-full")} />
          ))}
          <Skeleton className="mt-6 h-5 w-40" />
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className={cn("h-3.5", index === 3 ? "w-1/2" : "w-full")} />
          ))}
        </div>
      </div>
    </SkeletonRegion>
  );
}

/** Bordered list of rows used by the settings pages. */
function CardRowsSkeleton({ rows }: { rows: number }) {
  return (
    <div className="divide-y divide-border rounded-xl border border-border bg-card">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3 p-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className={cn("h-3.5", index % 2 === 0 ? "w-40" : "w-28")} />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-8 w-28" />
        </div>
      ))}
    </div>
  );
}

/** « Administration »: header, section tabs, a list panel. */
function AdminSkeleton() {
  return (
    <SkeletonRegion
      label="Chargement de l’administration"
      name="admin"
      className="mx-auto max-w-3xl space-y-6 p-8"
    >
      <PageTitleSkeleton titleClassName="w-44" description />
      <div className="space-y-5">
        <div className="flex gap-1 border-b border-border">
          {["w-16", "w-24", "w-16", "w-14", "w-32"].map((width, index) => (
            <div key={index} className="px-3 py-2.5">
              <Skeleton className={cn("h-3.5", width)} />
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <Skeleton className="h-8 w-36" />
        </div>
        <CardRowsSkeleton rows={4} />
      </div>
    </SkeletonRegion>
  );
}

/** A backlog's « Accès » settings: mode switch, then role panels. */
function AccessSkeleton() {
  return (
    <SkeletonRegion
      label="Chargement des accès"
      name="access"
      className="mx-auto max-w-4xl space-y-6 p-8"
    >
      <PageTitleSkeleton titleClassName="w-64" description />
      <div className="space-y-5">
        <div className="flex gap-2">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-28" />
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-3.5 w-80 max-w-full" />
        </div>
        <CardRowsSkeleton rows={3} />
        <div className="flex gap-2">
          <Skeleton className="h-8 flex-1" />
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-40" />
        </div>
      </div>
    </SkeletonRegion>
  );
}

/** A release card of the Releases list. */
function ReleaseCardSkeleton() {
  return (
    <div
      data-slot="release-card-skeleton"
      className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-4 w-40" />
          <div className="flex gap-2">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        </div>
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="space-y-1.5">
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-3.5 w-20" />
          </div>
        ))}
      </div>
      <Skeleton className="h-2 w-full rounded-full" />
    </div>
  );
}

/** A backlog's Roadmap: toolbar, item labels and calendar bars. */
function RoadmapSkeleton() {
  return (
    <SkeletonRegion label="Chargement de la roadmap" name="roadmap" className="flex h-full flex-col">
      <PageHeaderSkeleton titleClassName="w-36" />
      <div data-slot="roadmap-skeleton-toolbar" className="flex flex-wrap items-center gap-2 px-4 pb-3 sm:px-6">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-8 w-28" />
        <Skeleton className="ml-auto h-4 w-52" />
      </div>
      <div className="min-h-0 flex-1 px-3 pb-3 sm:px-4 sm:pb-4">
        <div className="h-full overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card">
          <div className="grid h-16 grid-cols-[10.5rem_minmax(0,1fr)] sm:grid-cols-[20rem_minmax(0,1fr)] border-b border-border">
            <div className="flex items-center border-r border-border px-4"><Skeleton className="h-3 w-24" /></div>
            <div className="flex items-center justify-around gap-4 px-4">
              {[0, 1, 2].map((index) => <Skeleton key={index} className="h-3 w-16" />)}
            </div>
          </div>
          {Array.from({ length: 7 }, (_, index) => (
            <div key={index} data-slot="roadmap-skeleton-row" className="grid grid-cols-[10.5rem_minmax(0,1fr)] sm:grid-cols-[20rem_minmax(0,1fr)] border-b border-border" style={{ height: "var(--row-h)" }}>
              <div className="flex min-w-0 items-center gap-2 border-r border-border pr-4" style={{ paddingLeft: index % 3 === 0 ? 12 : 32 }}>
                <Skeleton className="size-4 flex-none" />
                <Skeleton className="h-3 w-12 flex-none" />
                <Skeleton className="h-3 w-28 max-w-full" />
              </div>
              <div className="flex items-center px-4">
                <Skeleton className="h-5" style={{ marginLeft: `${(index % 3) * 10}%`, width: index % 2 === 0 ? "55%" : "35%" }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </SkeletonRegion>
  );
}

/** A backlog's Releases list. */
function ReleasesSkeleton() {
  return (
    <SkeletonRegion label="Chargement des releases" name="releases">
      <PageHeaderSkeleton className="mx-auto w-full max-w-6xl" titleClassName="w-32" description />
      <div className="mx-auto max-w-6xl space-y-4 px-4 pb-6 sm:px-6 lg:pb-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Skeleton className="h-3.5 w-36" />
          <Skeleton className="h-8 w-36" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, index) => (
            <ReleaseCardSkeleton key={index} />
          ))}
        </div>
      </div>
    </SkeletonRegion>
  );
}

/** One release: back link, header with facts, the current scope card. */
function ReleaseDetailSkeleton() {
  return (
    <SkeletonRegion label="Chargement de la release" name="release">
      <PageHeaderSkeleton className="mx-auto w-full max-w-6xl pb-0" titleClassName="hidden" />
      <div className="mx-auto max-w-6xl space-y-8 p-6 lg:p-8">
        <Skeleton className="h-3.5 w-36" />
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-[26px] w-48" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
              <Skeleton className="h-3.5 w-72 max-w-full" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-8 w-24" />
            </div>
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-2">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="space-y-1.5">
                <Skeleton className="h-3 w-14" />
                <Skeleton className="h-3.5 w-24" />
              </div>
            ))}
          </div>
        </div>
        {/* « Périmètre actuel »: the Backlog card, its filters on the second line. */}
        <SectionCardSkeleton
          rows={4}
          points
          meta={
            <div className="flex basis-full flex-wrap gap-2">
              {["w-14", "w-16", "w-20", "w-16"].map((width, index) => (
                <Skeleton key={index} className={cn("h-7 rounded-full", width)} />
              ))}
            </div>
          }
        />
      </div>
    </SkeletonRegion>
  );
}

/** Release notes: options, actions, then the editor and its preview. */
function ReleaseNotesSkeleton() {
  return (
    <SkeletonRegion
      label="Chargement des notes de release"
      name="release-notes"
      className="mx-auto max-w-6xl space-y-6 p-6 lg:p-8"
    >
      <Skeleton className="h-3.5 w-36" />
      <div className="space-y-2">
        <Skeleton className="h-[26px] w-80 max-w-full" />
        <Skeleton className="h-3.5 w-full max-w-xl" />
      </div>
      <div className="space-y-6">
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-4 w-44" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-32" />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          {["Markdown", "Aperçu"].map((pane) => (
            <div key={pane} className="space-y-2">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-96 w-full rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </SkeletonRegion>
  );
}

/** Sprint reports: breadcrumb header, report navigation, KPIs and chart. */
function ReportsSkeleton() {
  return (
    <SkeletonRegion label="Chargement des rapports…" name="reports">
      <PageHeaderSkeleton className="mx-auto w-full max-w-7xl" titleClassName="hidden" />
      <div className="mx-auto max-w-7xl space-y-6 px-4 pb-6 sm:px-6 lg:pb-8">
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    </SkeletonRegion>
  );
}

export {
  AccessSkeleton,
  SectionCardSkeleton,
  AdminSkeleton,
  HelpSkeleton,
  HomeSkeleton,
  ItemRowsSkeleton,
  MineSkeleton,
  PageHeaderSkeleton,
  ReleaseDetailSkeleton,
  ReleaseNotesSkeleton,
  ReleasesSkeleton,
  ReportsSkeleton,
  RoadmapSkeleton,
  TrashSkeleton,
};
