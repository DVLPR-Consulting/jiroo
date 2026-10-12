import Link from "next/link";
import { FolderKanban } from "lucide-react";
import { BacklogStarButton } from "@/components/backlogs/backlog-star-button";
import { InitialsAvatar } from "@/components/jiroo/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { LABEL_HUES, type LabelHue } from "@/lib/design/constants";
import { formatPoints, frenchPlural, pointsLabel } from "@/lib/format/plural";
import type { BacklogOverviewRow } from "@/lib/services/backlogs";

function hueFor(value: string): LabelHue {
  let hash = 0;
  for (let index = 0; index < value.length; index++) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return LABEL_HUES[Math.abs(hash) % LABEL_HUES.length]!;
}

// Star · Backlog · Items ouverts · Sprint actif · Responsable (Jira's Projects page).
const COLUMNS =
  "sm:grid-cols-[2rem_minmax(0,1.5fr)_6.5rem_minmax(0,1.4fr)_minmax(0,1fr)]";

function ActiveSprint({ sprint }: { sprint: BacklogOverviewRow["activeSprint"] }) {
  if (!sprint) {
    return <span className="text-muted-foreground">Aucun sprint actif</span>;
  }
  const { completedPoints, commitmentPoints } = sprint;
  const ratio =
    commitmentPoints === null || commitmentPoints === 0
      ? null
      : Math.min(1, completedPoints / commitmentPoints);
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span className="flex min-w-0 items-baseline gap-2">
        <span className="min-w-0 truncate font-medium text-foreground">{sprint.name}</span>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {commitmentPoints === null ? (
            <span title="Engagement au démarrage indisponible">
              {`${pointsLabel(completedPoints)} terminés`}
            </span>
          ) : (
            <>
              <span className="sr-only">{`${pointsLabel(completedPoints)} terminés sur ${pointsLabel(commitmentPoints)} engagés`}</span>
              <span aria-hidden>{`${formatPoints(completedPoints)} / ${pointsLabel(commitmentPoints)}`}</span>
            </>
          )}
        </span>
      </span>
      {ratio !== null && (
        <span aria-hidden className="block h-1 w-full max-w-48 overflow-hidden rounded-full bg-[var(--muted)]">
          <span
            className="block h-full rounded-full bg-[var(--status-done)]"
            style={{ width: `${Math.round(ratio * 100)}%` }}
          />
        </span>
      )}
    </span>
  );
}

function BacklogRow({ row }: { row: BacklogOverviewRow }) {
  return (
    <li
      data-backlog-row={row.key}
      className={`relative grid grid-cols-[2rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 px-3 py-3 transition-colors focus-within:bg-[var(--muted)]/60 hover:bg-[var(--muted)]/60 sm:px-4 ${COLUMNS}`}
    >
      <BacklogStarButton
        backlogId={row.id}
        backlogName={row.name}
        starred={row.starred}
        className="relative z-10 -ml-1"
      />
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded-full"
          style={{ background: row.color }}
        />
        {/* The name's hit area covers the whole row (Jira opens the project). */}
        <Link
          href={`/b/${row.key}`}
          className="min-w-0 truncate text-sm font-medium text-foreground outline-none after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:after:rounded-[var(--radius)] focus-visible:after:ring-2 focus-visible:after:ring-[var(--ring)] focus-visible:after:ring-inset"
        >
          {row.name}
        </Link>
        <span className="shrink-0 rounded bg-[var(--muted)] px-1.5 py-0.5 font-mono text-[11px] font-medium text-muted-foreground">
          {row.key}
        </span>
      </div>
      <div className="col-start-2 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] sm:contents">
        <span className="text-muted-foreground sm:text-foreground" data-cell="open-items">
          <span className="tabular-nums">{row.openItemCount}</span>
          <span className="sm:sr-only">{` ${frenchPlural(row.openItemCount, "item ouvert", "items ouverts")}`}</span>
        </span>
        <span className="min-w-0 basis-full sm:basis-auto" data-cell="active-sprint">
          <ActiveSprint sprint={row.activeSprint} />
        </span>
        <span className="flex min-w-0 items-center gap-2" data-cell="lead">
          {row.lead ? (
            <>
              <InitialsAvatar name={row.lead.name} hue={hueFor(row.lead.id)} size={22} />
              <span className="min-w-0 truncate">
                <span className="sr-only">Responsable : </span>
                {row.lead.name}
              </span>
            </>
          ) : null}
        </span>
      </div>
    </li>
  );
}

/** The home page's « Backlogs » list (JIR-82). Rows come sorted: favourites first. */
export function BacklogOverview({ rows }: { rows: BacklogOverviewRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="grid h-full place-items-center p-10">
        <EmptyState
          icon={<FolderKanban className="size-5" />}
          title="Aucun backlog"
          description="Un administrateur peut en créer un dans l’administration."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-4 pb-8 sm:px-6 sm:pt-6">
      <header className="mb-4 flex items-baseline gap-3">
        <h1 className="t-h1">Backlogs</h1>
        <span className="t-sm tabular-nums text-muted-foreground">{rows.length}</span>
      </header>
      <section
        aria-labelledby="backlog-overview-title"
        className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-[var(--surface)]"
      >
        <h2 id="backlog-overview-title" className="sr-only">
          Backlogs accessibles, favoris en premier
        </h2>
        <div
          aria-hidden
          className={`hidden gap-x-3 border-b border-border bg-[var(--surface-2)] px-4 py-2 text-xs font-medium text-muted-foreground sm:grid ${COLUMNS}`}
        >
          <span />
          <span>Backlog</span>
          <span>Items ouverts</span>
          <span>Sprint actif</span>
          <span>Responsable</span>
        </div>
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <BacklogRow key={row.id} row={row} />
          ))}
        </ul>
      </section>
    </div>
  );
}
