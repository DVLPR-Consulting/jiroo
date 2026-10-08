"use client";

import { useRef, useState, type ReactNode } from "react";
import { ChevronRight, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EditSprintDialog } from "@/components/sprints/sprint-form-dialog";
import type { SprintMetrics, SprintSummary } from "@/lib/items/sprint-planning";
import type { PlanningCapabilities } from "@/lib/auth/capabilities";
import type { PointsByStatusCategory } from "@/lib/items/status-points";
import { countLabel, pointsLabel } from "@/lib/format/plural";

const points = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const dates = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" });
const signedPoints = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
});

const stateLabel = {
  planned: "Planifié",
  active: "Actif",
  completed: "Terminé",
} as const;

const PILLS = [
  { key: "todo", label: "À faire", background: "var(--status-todo-bg)" },
  { key: "inProgress", label: "En cours", background: "var(--status-doing-bg)" },
  { key: "done", label: "Terminé", background: "var(--status-done-bg)" },
] as const;

/** Story points per status category, as Jira's backlog header lozenges. */
export function StatusPointsPills({ value }: { value: PointsByStatusCategory }) {
  const summary = PILLS.map((pill) => `${pill.label} ${points.format(value[pill.key])}`).join(", ");
  return (
    <span className="flex items-center gap-1.5 text-xs" data-status-points>
      <span className="sr-only">{`Points par statut : ${summary}`}</span>
      {PILLS.map((pill) => (
        <span
          key={pill.key}
          aria-hidden
          title={pill.label}
          className="min-w-[22px] rounded-full px-1.5 py-0.5 text-center font-semibold tabular-nums text-foreground"
          style={{ background: pill.background }}
        >
          {points.format(value[pill.key])}
        </span>
      ))}
      <span aria-hidden className="ml-0.5 text-muted-foreground">pts</span>
    </span>
  );
}

function itemsSummary(metrics: SprintMetrics) {
  return `${countLabel(metrics.itemCount, "item", "items")} · ${countLabel(
    metrics.unestimatedCount,
    "non estimé",
    "non estimés",
  )}`;
}

export function SprintSectionHeader({
  kind,
  sprint,
  metrics,
  statusPoints,
  expanded,
  onExpandedChange,
  canManage,
  capabilities,
  canMoveUp = false,
  canMoveDown = false,
  onMoveUp,
  onMoveDown,
  backlogId,
  backlogKey,
  primaryAction,
  selectControl,
}: {
  kind: "active" | "planned" | "backlog";
  sprint: SprintSummary | null;
  metrics: SprintMetrics;
  statusPoints: PointsByStatusCategory;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  canManage: boolean;
  capabilities?: PlanningCapabilities;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  /** Needed to edit the sprint from the ⋯ menu and the « Ajouter des dates » link. */
  backlogId?: string;
  backlogKey?: string;
  /** The one filled action of the section (start / complete / create a sprint). */
  primaryAction?: ReactNode;
  /** Select-all checkbox of the section's rows. */
  selectControl?: ReactNode;
}) {
  const canManageSprint = capabilities?.manageSprints ?? canManage;
  const name = sprint?.name ?? "Backlog";
  const plannedStartAt = sprint?.plannedStartAt ?? null;
  const plannedEndAt = sprint?.plannedEndAt ?? null;
  const goal = sprint?.goal ?? null;
  const dateRange = plannedStartAt
    ? `${dates.format(plannedStartAt)}${plannedEndAt ? ` – ${dates.format(plannedEndAt)}` : ""}`
    : null;
  const canEdit = canManageSprint && sprint !== null && backlogId !== undefined && backlogKey !== undefined;
  const [editOpen, setEditOpen] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const editReturnRef = useRef<HTMLElement | null>(null);

  function openEdit(returnTo: HTMLElement | null) {
    editReturnRef.current = returnTo;
    setEditOpen(true);
  }

  return (
    <header className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b border-border px-3 py-2.5 sm:px-3.5">
      {selectControl}
      <button
        type="button"
        className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground outline-none hover:bg-[var(--muted)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        aria-label={`${expanded ? "Replier" : "Déplier"} ${name}`}
        aria-expanded={expanded}
        onClick={() => onExpandedChange(!expanded)}
      >
        <ChevronRight
          aria-hidden
          className={`size-4 transition-transform ${expanded ? "rotate-90" : ""}`}
        />
      </button>
      <h3 className="min-w-0 truncate text-[15px] font-semibold">{name}</h3>
      {sprint ? (
        <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-[11.5px] font-medium text-muted-foreground">
          {stateLabel[sprint.state]}
        </span>
      ) : (
        <span className="text-[13px] text-muted-foreground">{itemsSummary(metrics)}</span>
      )}
      {sprint && (dateRange || goal) ? (
        <span className="flex min-w-0 flex-wrap gap-x-3 text-[13px] text-muted-foreground">
          {dateRange && <span>{dateRange}</span>}
          {goal && <span className="min-w-0 truncate">{goal}</span>}
        </span>
      ) : null}
      {sprint && !dateRange && !goal && canEdit ? (
        <button
          type="button"
          className="rounded text-[13px] font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          onClick={(event) => openEdit(event.currentTarget)}
        >
          Ajouter des dates et un objectif
        </button>
      ) : null}

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <StatusPointsPills value={statusPoints} />
        {primaryAction}
        {canEdit ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                ref={menuTriggerRef}
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Actions de ${name}`}
              >
                <MoreHorizontal aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onSelect={() => openEdit(menuTriggerRef.current)}>
                Modifier
              </DropdownMenuItem>
              {kind === "planned" ? (
                <>
                  <DropdownMenuItem disabled={!canMoveUp} onSelect={() => onMoveUp?.()}>
                    Monter
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={!canMoveDown} onSelect={() => onMoveDown?.()}>
                    Descendre
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      {sprint ? (
        <div className="flex basis-full flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span>{itemsSummary(metrics)}</span>
          {metrics.capacityPoints !== null && (
            <span>{`${points.format(metrics.estimatedPoints)} / ${pointsLabel(metrics.capacityPoints, points.format)}`}</span>
          )}
          {metrics.overCapacityPoints > 0 && (
            <span className="font-medium text-amber-700 dark:text-amber-300">
              {`Dépassement de ${pointsLabel(metrics.overCapacityPoints, points.format)}`}
            </span>
          )}
          {kind !== "backlog" &&
            (metrics.velocityComparison ||
              metrics.commitmentBasis === "sprint_start_unavailable") && (
              <VelocityComparison
                comparison={metrics.velocityComparison}
                // Jira-like: an active sprint is committed at start; its live total is
                // shown apart so scope added after start never rewrites the commitment.
                currentScopePoints={kind === "active" ? metrics.estimatedPoints : null}
                warnAboveAverage={kind === "planned"}
              />
            )}
        </div>
      ) : null}

      {canEdit && sprint ? (
        <EditSprintDialog
          backlogId={backlogId}
          backlogKey={backlogKey}
          sprint={sprint}
          open={editOpen}
          onOpenChange={setEditOpen}
          returnFocus={() => {
            const target = editReturnRef.current;
            return target?.isConnected ? target : menuTriggerRef.current;
          }}
        />
      ) : null}
    </header>
  );
}

function VelocityComparison({
  comparison,
  currentScopePoints,
  warnAboveAverage,
}: {
  comparison: SprintMetrics["velocityComparison"];
  currentScopePoints: number | null;
  warnAboveAverage: boolean;
}) {
  const currentScope = currentScopePoints !== null && (
    <p>{`Périmètre actuel ${pointsLabel(currentScopePoints, points.format)}`}</p>
  );
  if (comparison === null) {
    return (
      <>
        <p>Engagement au démarrage indisponible</p>
        {currentScope}
      </>
    );
  }
  if (comparison.state !== "ready") {
    return (
      <>
        <p>Pas encore de vélocité comparable</p>
        {currentScope}
      </>
    );
  }
  const aboveAverage = comparison.difference > 0;
  return (
    <>
      <p>
        {`Engagement ${pointsLabel(comparison.commitmentPoints, points.format)} · moyenne des sprints précédents ${pointsLabel(comparison.averageCompletedPoints, points.format)} · écart ${pointsLabel(comparison.difference, signedPoints.format)}`}
      </p>
      {currentScope}
      {warnAboveAverage && aboveAverage && (
        <p className="font-medium text-amber-700 dark:text-amber-300">
          Engagement supérieur à la moyenne des sprints précédents : avertissement non bloquant.
        </p>
      )}
    </>
  );
}
