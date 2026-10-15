"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { ChartGantt, ChevronRight } from "lucide-react";
import { TypeIcon } from "@/components/icons/type-icon";
import { ItemKey } from "@/components/jiroo/item-key";
import { useViewUrlState } from "@/components/shell/view-url-state";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useRoadmapEdits } from "@/components/roadmap/use-roadmap-edits";
import { addDays, type Day } from "@/lib/roadmap/days";
import {
  dragInterval,
  keyboardEdit,
  sameInterval,
  type Bar,
  type DragMode,
  type Interval,
} from "@/lib/roadmap/intervals";
import { buildRows, type RoadmapRow, type RoadmapSource } from "@/lib/roadmap/rows";
import {
  barRect,
  buildTimeline,
  dayToX,
  DAY_WIDTH,
  dragDays,
  ticks,
  timelineWidth,
  xToDay,
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
/** A click on an unplanned row plans a week from the clicked day. */
const PLAN_DAYS = 7;
/** Pointer travel under which a press is a click, not a drag. */
const DRAG_THRESHOLD_PX = 3;
/** Arrow keys repeat: save once they settle. */
const KEY_SAVE_DELAY_MS = 600;

type Drag = {
  row: RoadmapRow;
  mode: DragMode;
  origin: Interval;
  anchorX: number;
  preview: Interval;
  moved: boolean;
};

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
  backlogKey,
  canEdit,
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
  const hintId = useId();
  const [announcement, setAnnouncement] = useState("");
  const { effectiveItems, save } = useRoadmapEdits(backlogKey, items, setAnnouncement);
  const [drag, setDrag] = useState<Drag | null>(null);
  // Pointer events can outrun renders: handlers read the drag from here.
  const dragRef = useRef<Drag | null>(null);
  // The click that ends a drag must not open the item.
  const suppressClick = useRef(false);
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
    return buildRows(effectiveItems, sprintDays, { today, showDone });
  }, [effectiveItems, sprints, today, showDone]);
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
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    push((params) => params.set("item", key));
  }

  function commit(row: RoadmapRow, interval: Interval, delayMs = 0) {
    save(row, interval, barDescription({ ...interval, derived: false }), delayMs);
  }

  function updateDrag(next: Drag | null) {
    dragRef.current = next;
    setDrag(next);
  }

  function beginDrag(event: PointerEvent<HTMLElement>, row: RoadmapRow, mode: DragMode, origin: Interval) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    suppressClick.current = false;
    updateDrag({ row, mode, origin, anchorX: event.clientX, preview: origin, moved: false });
  }

  function pressBar(event: PointerEvent<HTMLElement>, row: RoadmapRow, bar: Bar) {
    const edge = (event.target as HTMLElement).dataset.edge;
    beginDrag(event, row, edge === "start" || edge === "end" ? edge : "move", bar);
  }

  function pressTrack(event: PointerEvent<HTMLElement>, row: RoadmapRow) {
    const day = xToDay(timeline, event.clientX - event.currentTarget.getBoundingClientRect().left);
    beginDrag(event, row, "plan", { start: day, end: day });
  }

  function moveDrag(event: PointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.anchorX;
    updateDrag({
      ...drag,
      preview: dragInterval(drag.mode, drag.origin, dragDays(timeline, dx)),
      moved: drag.moved || Math.abs(dx) > DRAG_THRESHOLD_PX,
    });
  }

  function endDrag() {
    const drag = dragRef.current;
    if (!drag) return;
    updateDrag(null);
    if (drag.mode === "plan") {
      commit(drag.row, drag.moved
        ? drag.preview
        : { start: drag.origin.start, end: addDays(drag.origin.start, PLAN_DAYS - 1) });
      return;
    }
    // A press without travel is a click: it opens the item.
    if (!drag.moved) return;
    suppressClick.current = true;
    if (!sameInterval(drag.preview, drag.origin)) commit(drag.row, drag.preview);
  }

  function nudge(event: KeyboardEvent<HTMLElement>, row: RoadmapRow, bar: Bar) {
    if (event.key === "Escape" && dragRef.current) {
      updateDrag(null);
      return;
    }
    const next = keyboardEdit(bar, event.key, event);
    if (!next) return;
    event.preventDefault();
    commit(row, next, KEY_SAVE_DELAY_MS);
  }

  const dragHandlers = {
    onPointerMove: moveDrag,
    onPointerUp: endDrag,
    onPointerCancel: () => updateDrag(null),
  };

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
                    <RoadmapTrack
                      row={row}
                      bar={drag?.row.id === row.id ? { ...drag.preview, derived: false } : row.bar}
                      dragging={drag?.row.id === row.id}
                      editable={canEdit && row.editable}
                      hintId={hintId}
                      timeline={timeline}
                      width={width}
                      onOpen={() => openItem(row.key)}
                      onPressBar={pressBar}
                      onPressTrack={pressTrack}
                      onKeyDown={nudge}
                      dragHandlers={dragHandlers}
                    />
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
      <p id={hintId} className="sr-only">
        Flèches gauche et droite : déplacer d’un jour. Avec Maj : changer l’échéance. Avec Alt : changer le début.
      </p>
      <p aria-live="polite" className="sr-only">{announcement}</p>
    </div>
  );
}

type DragHandlers = {
  onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
};

/** One row's calendar: its bar, or, when it can be planned, a surface to draw one. */
function RoadmapTrack({
  row,
  bar,
  dragging,
  editable,
  hintId,
  timeline,
  width,
  onOpen,
  onPressBar,
  onPressTrack,
  onKeyDown,
  dragHandlers,
}: {
  row: RoadmapRow;
  bar: Bar | null;
  dragging: boolean;
  editable: boolean;
  hintId: string;
  timeline: Timeline;
  width: number;
  onOpen: () => void;
  onPressBar: (event: PointerEvent<HTMLElement>, row: RoadmapRow, bar: Bar) => void;
  onPressTrack: (event: PointerEvent<HTMLElement>, row: RoadmapRow) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>, row: RoadmapRow, bar: Bar) => void;
  dragHandlers: DragHandlers;
}) {
  const plannable = editable && row.bar === null;
  return (
    <div
      className={cn("relative flex-none", plannable && "cursor-crosshair")}
      style={{ width }}
      title={plannable && !dragging ? "Cliquez ou glissez pour planifier" : undefined}
      data-roadmap-track={row.key}
      {...(plannable
        ? { onPointerDown: (event: PointerEvent<HTMLElement>) => onPressTrack(event, row), ...dragHandlers }
        : {})}
    >
      {bar ? (
        <RoadmapBar
          row={row}
          bar={bar}
          timeline={timeline}
          editable={editable}
          dragging={dragging}
          hintId={hintId}
          onOpen={onOpen}
          {...(editable && !plannable
            ? {
                onPointerDown: (event: PointerEvent<HTMLElement>) => onPressBar(event, row, bar),
                onKeyDown: (event: KeyboardEvent<HTMLElement>) => onKeyDown(event, row, bar),
                ...dragHandlers,
              }
            : {})}
        />
      ) : null}
    </div>
  );
}

function RoadmapBar({
  row,
  bar,
  timeline,
  editable,
  dragging,
  hintId,
  onOpen,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onKeyDown,
}: {
  row: RoadmapRow;
  bar: Bar;
  timeline: Timeline;
  editable: boolean;
  dragging: boolean;
  hintId: string;
  onOpen: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
} & Partial<DragHandlers> & { onPointerDown?: (event: PointerEvent<HTMLElement>) => void }) {
  const rect = barRect(timeline, bar);
  const progress = row.progress && row.progress.total > 0 ? row.progress.done / row.progress.total : null;
  return (
    <>
      {dragging ? (
        <span
          aria-hidden
          className="pointer-events-none absolute -top-1 z-30 -translate-y-full rounded bg-foreground px-1.5 py-0.5 text-xs whitespace-nowrap text-background shadow"
          style={{ left: rect.left }}
        >
          {barDescription(bar)}
        </span>
      ) : null}
      <button
        type="button"
        data-roadmap-bar={row.key}
        aria-label={`${row.key} — ${row.title}, ${barDescription(bar)}`}
        aria-describedby={editable ? hintId : undefined}
        title={dragging ? undefined : `${row.title} · ${barDescription(bar)}`}
        onClick={onOpen}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onKeyDown={onKeyDown}
        className={cn(
          "absolute top-1/2 -translate-y-1/2 overflow-hidden rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          row.depth === 0 ? "h-2" : "h-5",
          editable && "touch-none",
          editable && (dragging ? "cursor-grabbing shadow-md" : "cursor-grab"),
        )}
        style={{ left: rect.left, width: Math.max(rect.width, 6), ...barStyle(row, bar) }}
      >
        {progress !== null ? (
          <span aria-hidden className="absolute inset-y-0 left-0 bg-black/20" style={{ width: `${progress * 100}%` }} />
        ) : null}
        {editable ? (
          <>
            <span aria-hidden data-edge="start" className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize" />
            <span aria-hidden data-edge="end" className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize" />
          </>
        ) : null}
      </button>
    </>
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
