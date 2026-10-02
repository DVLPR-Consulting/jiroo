"use client";

import { useId, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SprintMetrics, SprintSummary } from "@/lib/items/sprint-planning";
import type { PlanningCapabilities } from "@/lib/auth/capabilities";

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

export function SprintSectionHeader({
  kind,
  sprint,
  metrics,
  expanded,
  onExpandedChange,
  canManage,
  capabilities,
  canMoveUp = false,
  canMoveDown = false,
  onMoveUp,
  onMoveDown,
  actions,
}: {
  kind: "active" | "planned" | "backlog";
  sprint: SprintSummary | null;
  metrics: SprintMetrics;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  canManage: boolean;
  capabilities?: PlanningCapabilities;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  actions?: ReactNode;
}) {
  const canManageSprint = capabilities?.manageSprints ?? canManage;
  const reorderHelpId = useId();
  const name = sprint?.name ?? "Backlog";
  const plannedStartAt = sprint?.plannedStartAt ?? null;
  const plannedEndAt = sprint?.plannedEndAt ?? null;
  const goal = sprint?.goal ?? null;
  const dateRange = plannedStartAt
    ? `${dates.format(plannedStartAt)}${plannedEndAt ? ` – ${dates.format(plannedEndAt)}` : ""}`
    : null;

  return (
    <header className="sticky top-0 z-10 flex flex-wrap items-center gap-x-3 gap-y-2 border-y border-border bg-[var(--surface-2)] px-3 py-2">
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`${expanded ? "Replier" : "Déplier"} ${name}`}
        aria-expanded={expanded}
        onClick={() => onExpandedChange(!expanded)}
      >
        <ChevronRight
          aria-hidden
          className={`size-4 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
        />
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold">{name}</h3>
            {sprint && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {stateLabel[sprint.state]}
              </span>
            )}
          </span>
          {(goal || dateRange) && (
            <span className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
              {goal && <span className="truncate">{goal}</span>}
              {dateRange && <span>{dateRange}</span>}
            </span>
          )}
        </span>
      </button>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{metrics.itemCount} tâche{metrics.itemCount === 1 ? "" : "s"}</span>
        <span>
          {metrics.capacityPoints === null
            ? `${points.format(metrics.estimatedPoints)} pt`
            : `${points.format(metrics.estimatedPoints)} / ${points.format(metrics.capacityPoints)} pt`}
        </span>
        <span>{metrics.unestimatedCount} non estimé{metrics.unestimatedCount > 1 ? "s" : ""}</span>
        {metrics.overCapacityPoints > 0 && (
          <span className="font-medium text-amber-700 dark:text-amber-300">
            Dépassement de {points.format(metrics.overCapacityPoints)} pt
          </span>
        )}
      </div>

      {(canManageSprint || actions) && (
        <div className="flex items-center gap-1">
          {canManageSprint && kind === "planned" && (
            <>
              <span id={`${reorderHelpId}-first`} className="sr-only">
                Ce sprint est déjà en première position.
              </span>
              <span id={`${reorderHelpId}-last`} className="sr-only">
                Ce sprint est déjà en dernière position.
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                disabled={!canMoveUp}
                onClick={onMoveUp}
                aria-label={`Monter ${name}`}
                aria-describedby={!canMoveUp ? `${reorderHelpId}-first` : undefined}
              >
                <ArrowUp aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                disabled={!canMoveDown}
                onClick={onMoveDown}
                aria-label={`Descendre ${name}`}
                aria-describedby={!canMoveDown ? `${reorderHelpId}-last` : undefined}
              >
                <ArrowDown aria-hidden />
              </Button>
            </>
          )}
          {actions}
        </div>
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
    <p>{`Périmètre actuel ${points.format(currentScopePoints)} pts`}</p>
  );
  if (comparison === null) {
    return (
      <div className="flex basis-full flex-wrap gap-x-3 text-xs text-muted-foreground">
        <p>Engagement au démarrage indisponible</p>
        {currentScope}
      </div>
    );
  }
  if (comparison.state !== "ready") {
    return (
      <div className="flex basis-full flex-wrap gap-x-3 text-xs text-muted-foreground">
        <p>Pas encore de vélocité comparable</p>
        {currentScope}
      </div>
    );
  }
  const aboveAverage = comparison.difference > 0;
  return (
    <div className="flex basis-full flex-wrap gap-x-3 text-xs text-muted-foreground">
      <p>
        {`Engagement ${points.format(comparison.commitmentPoints)} pts · moyenne récente ${points.format(comparison.averageCompletedPoints)} pts · écart ${signedPoints.format(comparison.difference)} pts`}
      </p>
      {currentScope}
      {warnAboveAverage && aboveAverage && (
        <p className="font-medium text-amber-700 dark:text-amber-300">
          Engagement supérieur à la moyenne récente : avertissement non bloquant.
        </p>
      )}
    </div>
  );
}
