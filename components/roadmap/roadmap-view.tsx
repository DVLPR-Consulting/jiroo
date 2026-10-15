"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ChartGantt, ChevronRight } from "lucide-react";
import { TypeIcon } from "@/components/icons/type-icon";
import { ItemKey } from "@/components/jiroo/item-key";
import { useViewUrlState } from "@/components/shell/view-url-state";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { Day } from "@/lib/roadmap/days";
import type { Bar } from "@/lib/roadmap/intervals";
import { buildRows, type RoadmapRow, type RoadmapSource } from "@/lib/roadmap/rows";
import {
  barRect,
  buildTimeline,
  dayToX,
  DAY_WIDTH,
  ticks,
  timelineWidth,
  ZOOMS,
  type Timeline,
  type Zoom,
} from "@/lib/roadmap/scale";
import { cn } from "@/lib/utils";

export type RoadmapViewSprint = {
  id: string;
  name: string;
  state: "planned" | "active";
  start: Day | null;
  end: Day | null;
};

export type RoadmapViewRelease = { id: string; name: string; day: Day | null; released: boolean };

type DatedSprint = RoadmapViewSprint & { start: Day; end: Day };
type DatedRelease = RoadmapViewRelease & { day: Day };

const ZOOM_LABELS: Record<Zoom, string> = {
  weeks: "Semaines",
  months: "Mois",
  quarters: "Trimestres",
};
const ZOOM_STORAGE_KEY = "jiroo.roadmap.zoom";
const DEFAULT_ZOOM: Zoom = "months";
const LABEL_WIDTH = 320;

const dayLabel = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatDay(day: Day): string {
  return dayLabel.format(new Date(`${day}T00:00:00Z`));
}

/** How a bar reads to a screen reader: its days, and whether they are its own. */
export function barDescription(bar: Bar): string {
  const days = bar.start === bar.end
    ? `le ${formatDay(bar.start)}`
    : `du ${formatDay(bar.start)} au ${formatDay(bar.end)}`;
  return bar.derived ? `${days} (déduit)` : days;
}

function readZoom(): Zoom {
  try {
    const stored = window.localStorage.getItem(ZOOM_STORAGE_KEY);
    return ZOOMS.includes(stored as Zoom) ? (stored as Zoom) : DEFAULT_ZOOM;
  } catch {
    return DEFAULT_ZOOM;
  }
}

function writeZoom(zoom: Zoom) {
  try {
    window.localStorage.setItem(ZOOM_STORAGE_KEY, zoom);
  } catch {
    // Private mode or blocked storage: the zoom simply isn't remembered.
  }
}

const CATEGORY_COLOR: Record<RoadmapRow["category"], string> = {
  todo: "var(--status-todo)",
  in_progress: "var(--status-doing)",
  done: "var(--status-done)",
};

function barStyle(row: RoadmapRow, bar: Bar): CSSProperties {
  const color = row.type === "composant"
    ? "var(--type-composant)"
    : row.type === "epic"
      ? "var(--type-epic)"
      : CATEGORY_COLOR[row.category];
  return {
    // A derived bar is hatched, as in Jira: its days are not set on the item.
    background: bar.derived
      ? `repeating-linear-gradient(135deg, color-mix(in oklch, ${color} 60%, transparent) 0 4px, color-mix(in oklch, ${color} 30%, transparent) 4px 8px)`
      : color,
  };
}

/** Rows shown: components always, epics unless their component is folded, tasks of open epics. */
function visible(
  rows: readonly RoadmapRow[],
  openEpics: ReadonlySet<string>,
  closedGroups: ReadonlySet<string>,
): RoadmapRow[] {
  const parentOf = new Map(rows.map((row) => [row.id, row.parentId]));
  return rows.filter((row) => {
    if (row.depth === 0) return true;
    const groupId = row.depth === 1 ? row.parentId : parentOf.get(row.parentId ?? "");
    if (groupId && closedGroups.has(groupId)) return false;
    return row.depth === 1 || (row.parentId !== null && openEpics.has(row.parentId));
  });
}

/**
 * Jira's timeline for one backlog: components as headings, their epics and,
 * once an epic is expanded, its tasks, each as a bar over a calendar.
 */
export function RoadmapView({
  today,
  items,
  sprints,
  releases,
}: {
  backlogKey: string;
  canEdit: boolean;
  today: Day;
  items: readonly RoadmapSource[];
  sprints: readonly RoadmapViewSprint[];
  releases: readonly RoadmapViewRelease[];
}) {
  const { push } = useViewUrlState();
  const scroller = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<Zoom>(DEFAULT_ZOOM);
  const [showDone, setShowDone] = useState(false);
  // Epics start collapsed, components expanded.
  const [openEpics, setOpenEpics] = useState<ReadonlySet<string>>(() => new Set());
  const [closedGroups, setClosedGroups] = useState<ReadonlySet<string>>(() => new Set());

  // The remembered zoom is read after hydration: the server cannot know it.
  useEffect(() => {
    const stored = readZoom();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored !== DEFAULT_ZOOM) setZoom(stored);
  }, []);

  const rows = useMemo(() => {
    const sprintDays = new Map(sprints.map((sprint) => [sprint.id, { start: sprint.start, end: sprint.end }]));
    return buildRows(items, sprintDays, { today, showDone });
  }, [items, sprints, today, showDone]);
  const shown = useMemo(() => visible(rows, openEpics, closedGroups), [rows, openEpics, closedGroups]);

  const datedSprints = useMemo(
    () => sprints.filter((sprint): sprint is DatedSprint =>
      sprint.start !== null && sprint.end !== null && sprint.start <= sprint.end),
    [sprints],
  );
  const datedReleases = useMemo(
    () => releases.filter((release): release is DatedRelease => release.day !== null),
    [releases],
  );
  const timeline = useMemo(
    () =>
      buildTimeline(
        [
          ...rows.flatMap((row) => (row.bar ? [row.bar] : [])),
          ...datedSprints,
          ...datedReleases.map((release) => ({ start: release.day, end: release.day })),
        ],
        today,
        zoom,
      ),
    [rows, datedSprints, datedReleases, today, zoom],
  );
  const width = timelineWidth(timeline);
  const half = DAY_WIDTH[zoom] / 2;
  const todayX = dayToX(timeline, today) + half;

  function scrollToToday(behavior: ScrollBehavior) {
    const node = scroller.current;
    if (!node) return;
    const span = node.clientWidth - LABEL_WIDTH;
    node.scrollTo({ left: Math.max(0, todayX - span / 3), behavior });
  }

  // Each zoom opens on today, as Jira's timeline does.
  useEffect(() => {
    scrollToToday("auto");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  function chooseZoom(next: Zoom) {
    setZoom(next);
    writeZoom(next);
  }

  function isOpen(row: RoadmapRow) {
    return row.depth === 0 ? !closedGroups.has(row.id) : openEpics.has(row.id);
  }

  function toggle(row: RoadmapRow) {
    const flip = (current: ReadonlySet<string>) => {
      const next = new Set(current);
      if (next.has(row.id)) next.delete(row.id);
      else next.add(row.id);
      return next;
    };
    if (row.depth === 0) setClosedGroups(flip);
    else setOpenEpics(flip);
  }

  function openItem(key: string) {
    push((params) => params.set("item", key));
  }

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2 px-4 pb-3 sm:px-6">
      <div role="group" aria-label="Échelle" className="inline-flex rounded-lg border border-border bg-card p-0.5">
        {ZOOMS.map((candidate) => (
          <Button
            key={candidate}
            type="button"
            size="sm"
            variant={candidate === zoom ? "secondary" : "ghost"}
            aria-pressed={candidate === zoom}
            onClick={() => chooseZoom(candidate)}
          >
            {ZOOM_LABELS[candidate]}
          </Button>
        ))}
      </div>
      <Button type="button" size="sm" variant="outline" onClick={() => scrollToToday("smooth")}>
        Aujourd’hui
      </Button>
      <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          className="size-4 accent-[var(--primary)]"
          checked={showDone}
          onChange={(event) => setShowDone(event.target.checked)}
        />
        Afficher les éléments terminés
      </label>
    </div>
  );

  if (rows.length === 0) {
    return (
      <div className="flex flex-1 flex-col">
        {toolbar}
        <div className="grid flex-1 place-items-center p-10">
          <EmptyState
            icon={<ChartGantt className="size-5" />}
            title="Rien à planifier pour l’instant"
            description="Créez des composants et des epics dans l’arbre : ils apparaîtront ici sur le calendrier."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {toolbar}
      <div className="min-h-0 flex-1 px-3 pb-3 sm:px-4 sm:pb-4">
        <div
          ref={scroller}
          data-testid="roadmap-scroller"
          className="h-full overflow-auto rounded-[var(--radius-lg)] border border-border bg-card"
        >
          <div className="relative" style={{ width: LABEL_WIDTH + width }}>
            <RoadmapHeader timeline={timeline} width={width} sprints={datedSprints} releases={datedReleases} />
            <div className="relative">
              {shown.map((row) => {
                const foldable = row.hasChildren && row.depth < 2;
                return (
                  <div
                    key={row.id}
                    data-roadmap-row={row.key}
                    className="flex min-h-[var(--row-h)] border-b border-border"
                  >
                    <div
                      className={cn(
                        "sticky left-0 z-10 flex flex-none items-center gap-2 border-r border-border bg-card pr-3 text-sm",
                        row.depth === 0 && "bg-[var(--surface-2)] font-medium",
                      )}
                      style={{ width: LABEL_WIDTH, paddingLeft: 8 + row.depth * 20 }}
                    >
                      <button
                        type="button"
                        aria-label={foldable ? `${isOpen(row) ? "Replier" : "Déplier"} ${row.key}` : undefined}
                        aria-expanded={foldable ? isOpen(row) : undefined}
                        onClick={() => toggle(row)}
                        className="grid size-4 flex-none place-items-center text-muted-foreground"
                        style={{ visibility: foldable ? "visible" : "hidden" }}
                        tabIndex={foldable ? 0 : -1}
                      >
                        <ChevronRight
                          size={13}
                          className="transition-transform"
                          style={{ transform: isOpen(row) ? "rotate(90deg)" : "rotate(0deg)" }}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => openItem(row.key)}
                        className="flex min-w-0 flex-1 items-center gap-2 rounded text-left outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        <TypeIcon type={row.type} />
                        <ItemKey value={row.key} />
                        <span className="min-w-0 flex-1 truncate">{row.title}</span>
                      </button>
                      {row.progress && row.progress.total > 0 ? (
                        <span
                          className="flex-none text-xs tabular-nums text-muted-foreground"
                          title="Tâches terminées"
                        >
                          {row.progress.done}/{row.progress.total}
                        </span>
                      ) : null}
                    </div>
                    <div className="relative flex-none" style={{ width }}>
                      {row.bar ? (
                        <RoadmapBar row={row} bar={row.bar} timeline={timeline} onOpen={() => openItem(row.key)} />
                      ) : null}
                    </div>
                  </div>
                );
              })}
              <div aria-hidden className="pointer-events-none absolute inset-y-0" style={{ left: LABEL_WIDTH, width }}>
                {datedReleases.map((release) => (
                  <div
                    key={release.id}
                    className="absolute inset-y-0 border-l border-dashed border-[var(--type-composant)]"
                    style={{ left: dayToX(timeline, release.day) + half }}
                  />
                ))}
                <div data-testid="roadmap-today" className="absolute inset-y-0 w-px bg-primary" style={{ left: todayX }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RoadmapBar({
  row,
  bar,
  timeline,
  onOpen,
}: {
  row: RoadmapRow;
  bar: Bar;
  timeline: Timeline;
  onOpen: () => void;
}) {
  const rect = barRect(timeline, bar);
  const progress = row.progress && row.progress.total > 0 ? row.progress.done / row.progress.total : null;
  return (
    <button
      type="button"
      data-roadmap-bar={row.key}
      aria-label={`${row.key} — ${row.title}, ${barDescription(bar)}`}
      title={`${row.title} · ${barDescription(bar)}`}
      onClick={onOpen}
      className={cn(
        "absolute top-1/2 -translate-y-1/2 overflow-hidden rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        row.depth === 0 ? "h-2" : "h-5",
      )}
      style={{ left: rect.left, width: Math.max(rect.width, 6), ...barStyle(row, bar) }}
    >
      {progress !== null ? (
        <span aria-hidden className="absolute inset-y-0 left-0 bg-black/20" style={{ width: `${progress * 100}%` }} />
      ) : null}
    </button>
  );
}

function RoadmapHeader({
  timeline,
  width,
  sprints,
  releases,
}: {
  timeline: Timeline;
  width: number;
  sprints: readonly DatedSprint[];
  releases: readonly DatedRelease[];
}) {
  const half = DAY_WIDTH[timeline.zoom] / 2;
  return (
    <div className="sticky top-0 z-20 flex border-b border-border bg-card text-xs text-muted-foreground">
      <div
        className="sticky left-0 z-10 flex flex-none items-end border-r border-border bg-card px-3 pb-1.5 font-medium"
        style={{ width: LABEL_WIDTH }}
      >
        Élément
      </div>
      <div className="relative flex-none" style={{ width, height: 56 }}>
        {ticks(timeline).map((tick) => (
          <span
            key={tick.day}
            className="absolute top-0 h-6 border-l border-border pl-1.5 leading-6 whitespace-nowrap"
            style={{ left: tick.x }}
          >
            {tick.label}
          </span>
        ))}
        {sprints.map((sprint) => {
          const rect = barRect(timeline, sprint);
          return (
            <span
              key={sprint.id}
              title={`${sprint.name} · ${barDescription({ ...sprint, derived: false })}`}
              className={cn(
                "absolute top-7 h-5 truncate rounded px-1.5 leading-5",
                sprint.state === "active"
                  ? "bg-[var(--accent-subtle)] text-[var(--accent-subtle-fg)]"
                  : "bg-[var(--surface-2)]",
              )}
              style={{ left: rect.left, width: rect.width }}
            >
              {sprint.name}
            </span>
          );
        })}
        {releases.map((release) => (
          <span
            key={release.id}
            role="img"
            aria-label={`Release ${release.name}, ${formatDay(release.day)}`}
            title={`${release.name} · ${formatDay(release.day)}`}
            className={cn(
              "absolute bottom-1 size-2.5 -translate-x-1/2 rotate-45 border border-[var(--type-composant)]",
              release.released ? "bg-[var(--type-composant)]" : "bg-card",
            )}
            style={{ left: dayToX(timeline, release.day) + half }}
          />
        ))}
      </div>
    </div>
  );
}
