"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type FormEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { carveAbsenceAction, declareAbsenceAction, removeAbsenceAction } from "@/app/actions/absences";
import { ItemRow } from "@/components/items/item-row";
import { InitialsAvatar } from "@/components/jiroo/avatar";
import { PageHeader } from "@/components/shell/page-header";
import { PageToolbar } from "@/components/shell/page-toolbar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { halfKey, halfName, type Half, type HalfDay } from "@/lib/dates/half-days";
import { isWorkingDay, nextWorkingDay, publicHoliday } from "@/lib/dates/working-days";
import { LABEL_HUES, type LabelHue } from "@/lib/design/constants";
import { countLabel, formatPoints } from "@/lib/format/plural";
import { absentHalf, absentWorkingDays } from "@/lib/le-point/absences";
import { formatDay } from "@/lib/le-point/model";
import { csvDocument, registerRows, yearRows } from "@/lib/presence/csv";
import type { PresencePage } from "@/lib/presence/load";
import {
  activeIn,
  backlogsOf,
  daysOf,
  halfState,
  laneOf,
  personSummary,
  removalsFor,
  rightsBacklogFor,
  scopeBacklog,
  segmentsOn,
  selectionOutcome,
  selectionSlots,
  snapSelection,
  sprintBands,
  ticketsOf,
  ticketUntil,
  ticketWorkingDays,
  toAbsences,
  visiblePeople,
  type Display,
  type PresenceBacklog,
  type PresencePerson,
  type PresenceSprint,
  type PresenceTicket,
  type Selection,
  type View,
} from "@/lib/presence/view";
import { addDays, startOfMonth, type Day } from "@/lib/roadmap/days";
import { cn } from "@/lib/utils";

/**
 * « Calendrier d’équipe » (JIR-124, lot B2), after the validated mock-up: a
 * month, a sprint or a year of the team, developers then product; a drag on
 * the half-cells declares an absence, a click on one takes it off; a click
 * on a cell, a name or a sprint lists the tickets as the Liste shows them.
 * The URL carries the scope, the view and the period: the server reads them.
 */

const MONTH = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
const MONTH_SHORT = new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: "UTC" });
const WEEKDAYS = "LMMJVSD";
const CATEGORY_LABEL = { todo: "À faire", in_progress: "En cours", done: "Terminé" } as const;
const VIEW_PARAM: Record<View, string> = { month: "mois", sprint: "sprint", year: "annee" };
const VIEW_LABEL: Record<View, string> = { month: "Mois", sprint: "Sprint", year: "Année" };
const CELL = { narrow: 28, wide: 60, name: 160, total: 108 };
const BUTTON = "inline-flex h-[30px] items-center rounded-[var(--radius)] border border-border bg-[var(--surface)] px-2.5 text-[13px] hover:bg-[var(--surface-2)] disabled:opacity-60";
const LINK = "text-xs text-[var(--primary)] underline";
const PRIMARY = "border-[var(--primary)] bg-[var(--primary)] font-medium text-white hover:bg-[var(--primary)]";
const FIELD = "h-[30px] rounded-[var(--radius)] border border-border bg-[var(--surface)] px-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]";
const CELL_BORDER = "border-b border-r border-border";

type Panel = { kind: "person"; personId: string; from: Day; to: Day; label: string } | { kind: "sprint"; sprint: PresenceSprint };
type Drag = { personId: string; from: HalfDay; to: HalfDay; x: number; y: number; moved: boolean };

const at = (day: Day) => new Date(`${day}T00:00:00Z`);
const weekdayLetter = (day: Day) => WEEKDAYS[(at(day).getUTCDay() + 6) % 7];
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const monthLabel = (day: Day) => capitalize(MONTH.format(at(day)));
const monthShort = (day: Day) => MONTH_SHORT.format(at(day)).replace(".", "");
function hueFor(value: string): LabelHue {
  let hash = 0;
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return LABEL_HUES[hash % LABEL_HUES.length]!;
}

/** « du 3 nov. après-midi au 6 nov. », « le 5 nov. matin ». */
function spanLabel(from: HalfDay, to: HalfDay): string {
  if (from.day === to.day) return from.half === to.half ? `le ${formatDay(from.day)} ${halfName(from.half)}` : `le ${formatDay(from.day)}`;
  return `du ${formatDay(from.day)}${from.half === "pm" ? " après-midi" : ""} au ${formatDay(to.day)}${to.half === "am" ? " matin" : ""}`;
}

/** The page's URL for another scope, view or period. */
export function hrefFor(page: PresencePage, over: { scopeKey?: string | null; view?: View; anchor?: Day; sprintId?: string | null; display?: Display } = {}): string {
  const scopeKey = over.scopeKey === undefined ? scopeBacklog(page.data, page.scope)?.key ?? null : over.scopeKey;
  const requested = over.view ?? page.view;
  const view: View = requested === "sprint" && !scopeKey ? "month" : requested;
  const params = new URLSearchParams();
  if (scopeKey) params.set("backlog", scopeKey);
  params.set("vue", VIEW_PARAM[view]);
  params.set("date", over.anchor ?? page.anchor);
  const sprintId = over.sprintId === undefined ? page.sprint?.id ?? null : over.sprintId;
  if (view === "sprint" && sprintId) params.set("sprint", sprintId);
  if ((over.display ?? page.display) === "absences") params.set("affichage", "absences");
  return `/presences?${params.toString()}`;
}

/** The months a period crosses, each clipped to it. */
function monthsIn(from: Day, to: Day): { from: Day; to: Day }[] {
  const months: { from: Day; to: Day }[] = [];
  for (let start = startOfMonth(from); start <= to; start = startOfMonth(addDays(start, 31))) {
    const end = addDays(startOfMonth(addDays(start, 31)), -1);
    months.push({ from: start < from ? from : start, to: end > to ? to : end });
  }
  return months;
}

function BacklogTag({ backlog, small = false }: { backlog: PresenceBacklog; small?: boolean }) {
  return (
    <span
      className={cn("inline-flex items-center justify-center rounded px-1.5 font-semibold text-white", small ? "h-[18px] text-[10px]" : "h-6 min-w-6 text-[10px]")}
      style={{ background: backlog.color }}
    >
      {backlog.key}
    </span>
  );
}

export function PresencesView({ page }: { page: PresencePage }) {
  const { data, scope, view, period } = page;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [clicked, setClicked] = useState<{ personId: string; slot: HalfDay } | null>(null);
  const [raw, setRaw] = useState<{ personId: string; a: HalfDay; b: HalfDay } | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [declaring, setDeclaring] = useState(false);
  const grid = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);

  const absences = toAbsences(data.absences);
  const backlog = scopeBacklog(data, scope);
  const groups = visiblePeople(data, scope);
  const everyone = [...groups.developers, ...groups.product];
  const people = new Map(data.people.map((person) => [person.id, person]));
  const days = daysOf(period.from, period.to);
  const wide = days.length <= 16;
  const cellWidth = wide ? CELL.wide : CELL.narrow;
  const periodLabel = view === "year" ? period.from.slice(0, 4) : view === "sprint" && page.sprint ? page.sprint.name : monthLabel(period.from);

  useEffect(() => {
    // A drag released inside the grid ends with a click the handler must
    // ignore; released outside, no click follows, so the next one is real.
    const up = (event: MouseEvent) => {
      const current = drag.current;
      if (!current) return;
      drag.current = null;
      setRaw(null);
      if (!current.moved) return;
      suppressClick.current = event.target instanceof Node && (grid.current?.contains(event.target) ?? false);
      setClicked(null);
      setSelection(snapSelection(current.personId, current.from, current.to));
    };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  const reset = () => {
    setSelection(null);
    setClicked(null);
    setRaw(null);
  };
  const run = (work: () => Promise<{ ok: true } | { ok: false; error: string }>, after?: () => void) =>
    startTransition(async () => {
      setError(null);
      const result = await work();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      reset();
      after?.();
      router.refresh();
    });
  const carveAll = (removals: { absenceId: string; from: HalfDay; to: HalfDay }[], backlogId: string) =>
    run(async () => {
      for (const removal of removals) {
        const result = await carveAbsenceAction({
          id: removal.absenceId, backlogId,
          startDate: removal.from.day, startHalf: removal.from.half, endDate: removal.to.day, endHalf: removal.to.half,
        });
        if (!result.ok) return result;
      }
      return { ok: true as const };
    });

  // A drag across the half-cells of one row; a plain click opens the day's tickets.
  const halfOf = (target: EventTarget | null) => (target as HTMLElement | null)?.closest<HTMLElement>("[data-half]") ?? null;
  const slotOf = (element: HTMLElement): HalfDay => ({ day: element.dataset.day!, half: element.dataset.half as Half });
  const onMouseDown = (event: ReactMouseEvent) => {
    suppressClick.current = false;
    const half = halfOf(event.target);
    if (!half || half.dataset.editable !== "true" || !isWorkingDay(half.dataset.day!)) return;
    event.preventDefault();
    const slot = slotOf(half);
    drag.current = { personId: half.dataset.person!, from: slot, to: slot, x: event.clientX, y: event.clientY, moved: false };
  };
  const onMouseMove = (event: ReactMouseEvent) => {
    const current = drag.current;
    if (!current) return;
    if (!current.moved && Math.hypot(event.clientX - current.x, event.clientY - current.y) < 4) return;
    if (!current.moved) {
      current.moved = true;
      setSelection(null);
      setClicked(null);
      setPanel(null);
    }
    const half = halfOf(event.target);
    if (half && half.dataset.person === current.personId) current.to = slotOf(half);
    setRaw({ personId: current.personId, a: current.from, b: current.to });
  };
  const onClick = (event: ReactMouseEvent) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    const target = event.target as HTMLElement;
    const half = halfOf(target);
    if (half && half.dataset.editable === "true" && (half.dataset.state === "away" || half.dataset.state === "future")) {
      setSelection(null);
      setClicked({ personId: half.dataset.person!, slot: slotOf(half) });
    }
    const band = target.closest<HTMLElement>("[data-sprint]");
    if (band) {
      const sprint = page.sprints.find((candidate) => candidate.id === band.dataset.sprint);
      if (sprint) setPanel({ kind: "sprint", sprint });
      return;
    }
    const day = target.closest<HTMLElement>("[data-day]");
    if (day) {
      setPanel({ kind: "person", personId: day.dataset.person!, from: day.dataset.day!, to: day.dataset.day!, label: `le ${formatDay(day.dataset.day!)}` });
      return;
    }
    const person = target.closest<HTMLElement>("[data-person-period]");
    if (person) setPanel({ kind: "person", personId: person.dataset.personPeriod!, from: period.from, to: period.to, label: periodLabel });
  };

  const selectedKeys = selection ? new Set(selectionSlots(selection).map((slot) => halfKey(slot.day, slot.half))) : null;
  const highlighted = (personId: string, day: Day, half: Half) => {
    const key = halfKey(day, half);
    if (raw && raw.personId === personId && isWorkingDay(day)) {
      const [low, high] = [halfKey(raw.a.day, raw.a.half), halfKey(raw.b.day, raw.b.half)].sort();
      if (low! <= key && key <= high!) return true;
    }
    if (selection?.personId === personId && selectedKeys?.has(key)) return true;
    return clicked?.personId === personId && clicked.slot.day === day && clicked.slot.half === half;
  };

  const download = (name: string, text: string) => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  };
  const scopeName = backlog ? `${backlog.key} · ${backlog.name}` : "Tous les backlogs";
  const fileScope = backlog ? backlog.key : "tous";
  const exportPeriod = () => {
    const rows = everyone.flatMap((person) =>
      monthsIn(period.from, period.to).map((month) => {
        const summary = personSummary(data, scope, person.id, month.from, month.to);
        const tickets = ticketsOf(data, person.id, scope);
        return {
          scope: scopeName, person: person.name, profile: person.profile, month: monthLabel(month.from),
          absenceDays: summary.away,
          startedTickets: tickets.filter((ticket) => ticket.startedAt >= month.from && ticket.startedAt <= month.to).length,
          completedTickets: summary.done,
          points: tickets.filter((ticket) => ticket.doneAt !== null && ticket.doneAt >= month.from && ticket.doneAt <= month.to).reduce((total, ticket) => total + (ticket.points ?? 0), 0),
        };
      }));
    download(`absences-conges-${fileScope}-${period.from}-${period.to}.csv`, csvDocument(yearRows(rows)));
  };
  const exportRegister = () => {
    const visible = new Set(everyone.map((person) => person.id));
    const rows = data.absences
      .filter((absence) => visible.has(absence.userId))
      .map((absence) => ({
        person: people.get(absence.userId)?.name ?? absence.userId, profile: people.get(absence.userId)?.profile ?? "product",
        start: absence.startDate, startHalf: absence.startHalf, end: absence.endDate, endHalf: absence.endHalf,
        workingDays: absentWorkingDays(toAbsences([absence]), absence.userId, absence.startDate, absence.endDate),
      }));
    download(`absences-${fileScope}-${period.from}-${period.to}.csv`, csvDocument(registerRows(rows)));
  };

  // Where ‹ › lead: the month or year before and after, or the neighbouring sprint.
  const sprintIndex = page.sprint ? page.sprints.findIndex((sprint) => sprint.id === page.sprint!.id) : -1;
  const previousHref = view === "year"
    ? hrefFor(page, { anchor: `${Number(period.from.slice(0, 4)) - 1}-01-01` })
    : view === "sprint"
      ? sprintIndex > 0 ? hrefFor(page, { sprintId: page.sprints[sprintIndex - 1]!.id, anchor: page.sprints[sprintIndex - 1]!.start }) : null
      : hrefFor(page, { anchor: startOfMonth(addDays(period.from, -1)) });
  const nextHref = view === "year"
    ? hrefFor(page, { anchor: `${Number(period.from.slice(0, 4)) + 1}-01-01` })
    : view === "sprint"
      ? sprintIndex >= 0 && sprintIndex < page.sprints.length - 1 ? hrefFor(page, { sprintId: page.sprints[sprintIndex + 1]!.id, anchor: page.sprints[sprintIndex + 1]!.start }) : null
      : hrefFor(page, { anchor: addDays(period.to, 1) });

  // The page is laid out as the others: the shell's header and toolbar, full width, the content under them.
  return (
    <div className="pb-10">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            Calendrier d’équipe
            <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">prototype</span>
          </span>
        }
        description="Qui est là, les tickets de chacun dans le temps, et vos absences à déclarer."
      />
      <PageToolbar>
        <DropdownMenu>
          <DropdownMenuTrigger className={cn(BUTTON, "gap-2 font-semibold")} aria-label="Portée">
            {backlog ? <BacklogTag backlog={backlog} /> : <span className="inline-flex h-6 items-center rounded bg-[var(--muted-foreground)] px-1.5 text-[10px] font-semibold text-white">TOUS</span>}
            {backlog ? backlog.name : "Tous les backlogs"}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-56">
            <DropdownMenuRadioGroup
              value={backlog?.key ?? "all"}
              onValueChange={(value) => router.push(hrefFor(page, { scopeKey: value === "all" ? null : value }))}
            >
              <DropdownMenuRadioItem value="all">Tous les backlogs</DropdownMenuRadioItem>
              {data.backlogs.map((candidate) => (
                <DropdownMenuRadioItem key={candidate.id} value={candidate.key} className="gap-2">
                  <BacklogTag backlog={candidate} small />
                  {candidate.name}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="inline-flex h-[30px] overflow-hidden rounded-[var(--radius)] border border-border bg-[var(--surface)]" role="group" aria-label="Vue">
          {(["month", "sprint", "year"] as const).map((candidate) => {
            const disabled = candidate === "sprint" && !backlog;
            return (
              <Link
                key={candidate}
                href={hrefFor(page, { view: candidate })}
                aria-current={view === candidate ? "page" : undefined}
                aria-disabled={disabled || undefined}
                title={disabled ? "Choisis un backlog pour lire par sprint" : undefined}
                className={cn("px-3 text-[13px] leading-[28px]", view === candidate ? "bg-foreground text-background" : "text-muted-foreground hover:bg-[var(--surface-2)]", disabled && "pointer-events-none opacity-45")}
              >
                {VIEW_LABEL[candidate]}
              </Link>
            );
          })}
        </div>
        <nav className="inline-flex items-center gap-1.5" aria-label="Période">
          {previousHref ? <Link href={previousHref} aria-label="Précédent" className={BUTTON}>‹</Link> : <span className={cn(BUTTON, "opacity-45")}>‹</span>}
          <strong className="min-w-[14ch] text-center text-[13px]">{periodLabel}</strong>
          {nextHref ? <Link href={nextHref} aria-label="Suivant" className={BUTTON}>›</Link> : <span className={cn(BUTTON, "opacity-45")}>›</span>}
          <Link href={hrefFor(page, { anchor: data.today, sprintId: null })} className={BUTTON}>Aujourd’hui</Link>
        </nav>
        <DeclareDialog
          page={page}
          people={everyone}
          open={declaring}
          onOpenChange={(open) => {
            setDeclaring(open);
            if (!open) setError(null);
          }}
          pending={pending}
          error={declaring ? error : null}
          onDeclare={(input) => run(() => declareAbsenceAction(input), () => setDeclaring(false))}
        />
        <div className="ml-auto inline-flex flex-wrap items-center gap-2">
          <div className="inline-flex h-[30px] overflow-hidden rounded-[var(--radius)] border border-border bg-[var(--surface)]" role="group" aria-label="Afficher">
            {([["all", "Absences et tickets"], ["absences", "Absences"]] as const).map(([candidate, label]) => (
              <Link
                key={candidate}
                href={hrefFor(page, { display: candidate })}
                aria-current={page.display === candidate ? "page" : undefined}
                className={cn("px-3 text-[13px] leading-[28px]", page.display === candidate ? "bg-foreground text-background" : "text-muted-foreground hover:bg-[var(--surface-2)]")}
              >
                {label}
              </Link>
            ))}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger className={cn(BUTTON, "gap-1.5")}>
              Exporter
              <ChevronDown aria-hidden="true" className="size-3.5 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => exportPeriod()}>Exporter la période (CSV)</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => exportRegister()}>Exporter les absences (CSV)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <RulesDialog />
        </div>
      </PageToolbar>

      {/* 16 px a side, the Board's and the Liste's margins on desktop. */}
      <div className="space-y-3 px-4 pt-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <Legend swatch="bg-[var(--danger)]">absent</Legend>
        <Legend swatch="bg-[linear-gradient(90deg,var(--danger)_0_50%,var(--surface)_50%)] ring-1 ring-[var(--danger)]">demi-journée (matin | après-midi)</Legend>
        <Legend swatch="bg-[repeating-linear-gradient(135deg,color-mix(in_oklch,var(--danger)_25%,transparent)_0_3px,transparent_3px_6px)] ring-1 ring-[var(--danger)]">absence à venir</Legend>
        <Legend swatch="bg-[color-mix(in_oklch,var(--status-doing)_45%,var(--surface))] ring-1 ring-[var(--status-doing)]">sélection</Legend>
        {page.display === "all" ? (
          <>
            <Legend swatch="h-2.5 w-5 bg-[var(--info)]">ticket en cours</Legend>
            <Legend swatch="h-2.5 w-5 bg-[var(--status-done)]">ticket terminé</Legend>
            <Legend swatch="h-2.5 w-5 bg-[var(--info)] opacity-25">ticket en pause (absence, week-end, férié)</Legend>
          </>
        ) : null}
        <Legend swatch="bg-[var(--muted)]">week-end et jour férié</Legend>
      </div>

      {view === "year" ? (
        <YearGrid page={page} everyone={groups} />
      ) : (
        <div
          ref={grid}
          className="max-h-[75vh] select-none overflow-auto rounded-[var(--radius)] border border-border bg-[var(--surface)]"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onClick={onClick}
        >
          {/* The grid takes the page's width, the days sharing it, never less than their minimum; the dates stay in sight while the rows scroll, the names while the days do: sticky cells, hence separate borders. */}
          <table className="border-separate border-spacing-0 text-xs [&_tr:last-child>td]:border-b-0" style={{ tableLayout: "fixed", width: "100%", minWidth: CELL.name + days.length * cellWidth + CELL.total }}>
            <thead>
              <tr>
                <th style={{ width: CELL.name }} className={cn(CELL_BORDER, "sticky left-0 top-0 z-[5] bg-[var(--surface-2)]")} />
                {days.map((day) => (
                  <th
                    key={day}
                    scope="col"
                    title={publicHoliday(day) ?? undefined}
                    className={cn(
                      CELL_BORDER,
                      "sticky top-0 z-[4] h-9 bg-[var(--surface-2)] text-[11px] font-medium leading-tight text-muted-foreground",
                      !isWorkingDay(day) && "bg-[var(--muted)]",
                    )}
                  >
                    <span className={cn("block text-[13px] text-foreground", day === data.today && "font-semibold text-[var(--primary)]")}>{Number(day.slice(8))}</span>
                    {wide ? `${monthShort(day)} ` : ""}{weekdayLetter(day)}
                  </th>
                ))}
                <th scope="col" style={{ width: CELL.total }} className={cn(CELL_BORDER, "sticky top-0 z-[4] border-r-0 bg-[var(--surface-2)] px-2 text-left text-[11px] font-medium text-muted-foreground")}>
                  {view === "sprint" ? "Sprint" : "Mois"}
                </th>
              </tr>
            </thead>
            <tbody>
              {backlog ? (
                <tr className="h-[22px] text-[11px]">
                  <td className={cn(CELL_BORDER, "sticky left-0 z-[3] bg-[var(--surface)] px-2 font-medium text-muted-foreground")}>Sprints {backlog.key}</td>
                  {sprintBands(days, page.sprints).map((band, index) => (
                    <td
                      key={index}
                      colSpan={band.span}
                      className={cn(
                        CELL_BORDER,
                        "overflow-hidden whitespace-nowrap text-left",
                        band.sprint && "border-l-[3px]",
                        band.state === "active" && "border-l-[var(--info)] bg-[color-mix(in_oklch,var(--info)_18%,var(--surface))]",
                        band.state === "completed" && "border-l-[var(--muted-foreground)] bg-[var(--muted)]",
                        band.state === "planned" && "border-l-border bg-[var(--surface-2)] text-muted-foreground",
                      )}
                    >
                      {band.sprint ? (
                        <button
                          type="button"
                          data-sprint={band.sprint.id}
                          title={`${band.sprint.name} : du ${formatDay(band.sprint.start)}${band.sprint.end ? ` au ${formatDay(band.sprint.end)}` : ""}`}
                          className="block w-full cursor-pointer truncate px-1.5 text-left font-medium hover:underline"
                        >
                          {band.sprint.name}{band.state === "active" ? " · en cours" : ""}
                        </button>
                      ) : null}
                    </td>
                  ))}
                  <td className={cn(CELL_BORDER, "border-r-0")} />
                </tr>
              ) : null}
              {(
                [
                  ["Développement", groups.developers, page.display === "all"],
                  ["Produit", groups.product, false],
                ] as const
              ).map(([label, members, withLanes]) => (
                members.length === 0 ? null : (
                  <GroupRows key={label} label={label} members={members} withLanes={withLanes} columns={days.length + 2}>
                    {(person) => (
                      <PersonRow
                        key={person.id}
                        page={page}
                        person={person}
                        days={days}
                        withLanes={withLanes}
                        editable={rightsBacklogFor(data, person.id) !== null}
                        highlighted={highlighted}
                      />
                    )}
                  </GroupRows>
                )
              ))}
            </tbody>
          </table>
        </div>
      )}

      {page.limited ? (
        <p role="status" className="text-xs text-muted-foreground">
          Plus de 2 000 tickets sur la période : les barres et les totaux n’en montrent qu’une partie. Réduis la portée ou la période.
        </p>
      ) : null}


      {panel ? <PanelView page={page} panel={panel} people={people} developers={groups.developers} onClose={() => setPanel(null)} /> : null}
      {/* The action bar keeps to the bottom of the window while a selection exists: a drag may start far above it, and the tickets panel may run long below. */}
      <div className="sticky bottom-0 z-[6] space-y-2 bg-[var(--background)] py-2 empty:hidden">
        {clicked ? (
          <ClickBar
            clicked={clicked}
            absences={absences}
            person={people.get(clicked.personId)}
            backlogId={rightsBacklogFor(data, clicked.personId)}
            pending={pending}
            onHalf={(absenceId, backlogId) => carveAll([{ absenceId, from: clicked.slot, to: clicked.slot }], backlogId)}
            onDay={(backlogId) => carveAll(removalsFor(absences, { personId: clicked.personId, from: { day: clicked.slot.day, half: "am" }, to: { day: clicked.slot.day, half: "pm" } }), backlogId)}
            onAll={(absenceId, backlogId) => run(() => removeAbsenceAction({ id: absenceId, backlogId }))}
            onClose={reset}
          />
        ) : selection ? (
          <SelectionBar
            selection={selection}
            outcome={selectionOutcome(absences, selection)}
            person={people.get(selection.personId)}
            backlogId={rightsBacklogFor(data, selection.personId)}
            pending={pending}
            onDeclare={(backlogId) => run(() => declareAbsenceAction({
              userId: selection.personId, backlogId,
              startDate: selection.from.day, startHalf: selection.from.half, endDate: selection.to.day, endHalf: selection.to.half,
            }))}
            onRemove={(backlogId) => carveAll(removalsFor(absences, selection), backlogId)}
            onClose={reset}
          />
        ) : null}
        {error ? <p role="alert" className="text-xs text-[var(--danger)]">{error}</p> : null}
      </div>
      </div>
    </div>
  );
}

function Legend({ swatch, children }: { swatch: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <i aria-hidden="true" className={cn("inline-block size-3.5 rounded-sm border border-border", swatch)} />
      {children}
    </span>
  );
}

function GroupRows({ label, members, columns, children }: {
  label: string;
  members: PresencePerson[];
  withLanes: boolean;
  columns: number;
  children: (person: PresencePerson) => ReactNode;
}) {
  return (
    <>
      <tr>
        <td colSpan={columns} className={cn(CELL_BORDER, "border-r-0 bg-[var(--surface-2)] py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground")}>
          <span className="sticky left-0 inline-block px-2">{label}</span>
        </td>
      </tr>
      {members.map(children)}
    </>
  );
}

function PersonRow({ page, person, days, withLanes, editable, highlighted }: {
  page: PresencePage;
  person: PresencePerson;
  days: Day[];
  withLanes: boolean;
  editable: boolean;
  highlighted: (personId: string, day: Day, half: Half) => boolean;
}) {
  const { data, scope, period } = page;
  const absences = toAbsences(data.absences);
  const tickets = withLanes ? ticketsOf(data, person.id, scope) : [];
  const lanes = laneOf(tickets, data.today);
  const summary = personSummary(data, scope, person.id, period.from, period.to);
  const backlog = scopeBacklog(data, scope);
  return (
    <tr>
      <td className={cn(CELL_BORDER, "sticky left-0 z-[3] bg-[var(--surface)] px-2 py-1 align-top")} style={{ width: CELL.name }}>
        <button type="button" data-person-period={person.id} aria-label={person.name} className="flex max-w-full items-center gap-2 text-left text-[13px] font-medium hover:text-[var(--primary)]">
          <InitialsAvatar name={person.name} hue={hueFor(person.id)} size={22} />
          <span className="truncate">{person.name}</span>
        </button>
        {!backlog ? (
          <div className="ml-[30px] mt-0.5 flex flex-wrap gap-1">
            {backlogsOf(data, person.id).map((candidate) => <BacklogTag key={candidate.id} backlog={candidate} small />)}
          </div>
        ) : null}
      </td>
      {days.map((day) => {
        const working = isWorkingDay(day);
        const segments = withLanes ? segmentsOn(tickets, lanes, day, data.today, period.to) : [];
        return (
          <td
            key={day}
            data-day={day}
            data-person={person.id}
            title={publicHoliday(day) ?? undefined}
            className={cn(CELL_BORDER, "cursor-pointer align-top hover:bg-[var(--surface-2)]", !working && "bg-[var(--muted)]", day === data.today && "shadow-[inset_0_0_0_2px_color-mix(in_oklch,var(--primary)_45%,transparent)]")}
          >
            <div className={cn("flex", withLanes ? "h-[22px]" : "h-[30px]")}>
              {(["am", "pm"] as const).map((half) => {
                const state = halfState(absences, person.id, day, half, data.today);
                const away = state === "away" || state === "future";
                return (
                  <button
                    key={half}
                    type="button"
                    data-half={half}
                    data-day={day}
                    data-person={person.id}
                    data-state={state}
                    data-editable={editable ? "true" : "false"}
                    aria-label={`${person.name}, ${formatDay(day)} ${halfName(half)}${away ? ", absent" : ""}`}
                    className={cn(
                      "min-w-0 flex-1 border-0 p-0",
                      half === "pm" && "border-l border-dashed border-border",
                      editable && working ? "cursor-crosshair" : "cursor-default",
                      state === "free" && editable && "hover:shadow-[inset_0_0_0_1px_var(--status-doing)]",
                      state === "away" && "bg-[var(--danger)]",
                      state === "future" && "bg-[repeating-linear-gradient(135deg,color-mix(in_oklch,var(--danger)_25%,transparent)_0_3px,transparent_3px_6px)] shadow-[inset_0_0_0_1px_var(--danger)]",
                      highlighted(person.id, day, half) && "bg-[color-mix(in_oklch,var(--status-doing)_45%,var(--surface))] shadow-[inset_0_0_0_1px_var(--status-doing)]",
                    )}
                  />
                );
              })}
            </div>
            {withLanes ? (
              // The tickets run in a lane of their own, tinted and ruled off from the half-days.
              <div className={cn("flex flex-col gap-[3px] border-t border-border py-1", working ? "bg-[color-mix(in_oklch,var(--info)_7%,var(--surface))]" : "bg-[var(--muted)]")}>
                {segments.map((segment, lane) => {
                  if (!segment) return <i key={lane} aria-hidden="true" className="block h-3" />;
                  const span = daysOf(segment.ticket.startedAt, ticketUntil(segment.ticket, data.today) < period.to ? ticketUntil(segment.ticket, data.today) : period.to).length;
                  // A bar is drawn by half-days: it pales when nobody works, the person away or the day off, the ticket open but paused.
                  const pale = { am: !working || absentHalf(absences, person.id, day, "am"), pm: !working || absentHalf(absences, person.id, day, "pm") };
                  return (
                    <button
                      key={lane}
                      type="button"
                      title={`${segment.ticket.key} · ${segment.ticket.title}`}
                      aria-label={`${segment.ticket.key}, ${segment.ticket.title}, ${segment.ticket.doneAt ? "terminé" : "en cours"}`}
                      className={cn(
                        "relative flex h-3 border-0 p-0 text-left",
                        segment.starts || segment.ends ? "w-[calc(100%-2px)]" : "w-full",
                        segment.starts && "ml-0.5",
                        segment.starts && segment.ends && "w-[calc(100%-4px)]",
                        segment.goesOn && "after:absolute after:-right-0.5 after:top-0 after:border-y-[6px] after:border-l-[7px] after:border-y-transparent after:border-l-[var(--surface)]",
                      )}
                    >
                      {(["am", "pm"] as const).map((half) => (
                        <span
                          key={half}
                          aria-hidden="true"
                          data-half-bar={half}
                          className={cn("block h-3 min-w-0 flex-1", segment.ticket.doneAt ? "bg-[var(--status-done)]" : "bg-[var(--info)]", pale[half] && "opacity-25")}
                        />
                      ))}
                      {segment.starts && span >= 2 ? (
                        <span className="pointer-events-none absolute left-0.5 top-0 z-[2] overflow-hidden whitespace-nowrap text-[9.5px] font-semibold leading-3 text-white" style={{ maxWidth: `calc(${span} * 100% - 8px)` }}>
                          {segment.ticket.key}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </td>
        );
      })}
      <td className={cn(CELL_BORDER, "border-r-0 px-2 text-[11px] leading-[1.35] text-muted-foreground")} data-person-period={person.id}>
        <b className="font-semibold text-[var(--danger)]">{formatPoints(summary.away)} j</b> absent
        {withLanes ? (
          <>
            <br />
            <b className="font-semibold text-[var(--status-done)]">{summary.done}</b> {summary.done > 1 ? "terminés" : "terminé"}
            {summary.doing ? <> · <b className="font-semibold text-[var(--info)]">{summary.doing}</b> en cours</> : null}
          </>
        ) : null}
      </td>
    </tr>
  );
}

function YearGrid({ page, everyone }: { page: PresencePage; everyone: { developers: PresencePerson[]; product: PresencePerson[] } }) {
  const { data, scope, period } = page;
  const months = monthsIn(period.from, period.to);
  const groups = [["Développement", everyone.developers], ["Produit", everyone.product]] as const;
  return (
    <div className="max-h-[75vh] overflow-auto rounded-[var(--radius)] border border-border bg-[var(--surface)]">
      <table className="border-separate border-spacing-0 text-xs [&_tr:last-child>td]:border-b-0" style={{ tableLayout: "fixed", width: "100%", minWidth: CELL.name + months.length * 72 + CELL.total }}>
        <thead>
          <tr>
            <th style={{ width: CELL.name }} className={cn(CELL_BORDER, "sticky left-0 top-0 z-[5] bg-[var(--surface-2)]")} />
            {months.map((month) => (
              <th key={month.from} scope="col" className={cn(CELL_BORDER, "sticky top-0 z-[4] h-9 bg-[var(--surface-2)] text-[13px] font-medium", month.from.slice(0, 7) === data.today.slice(0, 7) && "text-[var(--primary)]")}>
                {monthShort(month.from)}
              </th>
            ))}
            <th scope="col" style={{ width: CELL.total }} className={cn(CELL_BORDER, "sticky top-0 z-[4] border-r-0 bg-[var(--surface-2)] px-2 text-left text-[11px] font-medium text-muted-foreground")}>Année</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(([label, members]) => members.length === 0 ? null : (
            <GroupRows key={label} label={label} members={members} withLanes={false} columns={months.length + 2}>
              {(person) => {
                const year = personSummary(data, scope, person.id, period.from, period.to);
                return (
                  <tr key={person.id}>
                    <td className={cn(CELL_BORDER, "sticky left-0 z-[3] bg-[var(--surface)] px-2 py-1")} style={{ width: CELL.name }}>
                      <span className="flex items-center gap-2 text-[13px] font-medium"><InitialsAvatar name={person.name} hue={hueFor(person.id)} size={22} /><span className="truncate">{person.name}</span></span>
                    </td>
                    {months.map((month) => {
                      const summary = personSummary(data, scope, person.id, month.from, month.to);
                      return (
                        <td key={month.from} className={cn(CELL_BORDER, "p-0")}>
                          <Link href={hrefFor(page, { view: "month", anchor: month.from })} aria-label={`${person.name}, ${MONTH.format(at(month.from))}`} className="flex h-11 flex-col items-center justify-center gap-0.5 hover:bg-[var(--surface-2)]">
                            {summary.away ? <span className={cn("px-1.5 text-[11px] font-semibold leading-4 text-white", month.from > data.today ? "bg-[color-mix(in_oklch,var(--danger)_30%,var(--surface))] text-[var(--danger)]" : "bg-[var(--danger)]")}>{formatPoints(summary.away)} j</span> : null}
                            {person.profile === "developer" && summary.done ? <span className="text-[11px] font-semibold text-[var(--status-done)]">{summary.done} ✓</span> : null}
                          </Link>
                        </td>
                      );
                    })}
                    <td className={cn(CELL_BORDER, "border-r-0 px-2 text-[11px] leading-[1.35] text-muted-foreground")}>
                      <b className="font-semibold text-[var(--danger)]">{formatPoints(year.away)} j</b> absent
                      {person.profile === "developer" ? <><br /><b className="font-semibold text-[var(--status-done)]">{year.done}</b> terminés</> : null}
                    </td>
                  </tr>
                );
              }}
            </GroupRows>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const BAR = "flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-[var(--radius)] border px-3 py-2 text-[13px]";

function ClickBar({ clicked, absences, person, backlogId, pending, onHalf, onDay, onAll, onClose }: {
  clicked: { personId: string; slot: HalfDay };
  absences: ReturnType<typeof toAbsences>;
  person: PresencePerson | undefined;
  backlogId: string | null;
  pending: boolean;
  onHalf: (absenceId: string, backlogId: string) => void;
  /** The day may hold a morning and an afternoon declared apart: every absence on it is carved. */
  onDay: (backlogId: string) => void;
  onAll: (absenceId: string, backlogId: string) => void;
  onClose: () => void;
}) {
  const key = halfKey(clicked.slot.day, clicked.slot.half);
  const absence = absences.find((candidate) =>
    candidate.user === clicked.personId && candidate.id !== undefined
    && halfKey(candidate.start, candidate.startHalf ?? "am") <= key && key <= halfKey(candidate.end, candidate.endHalf ?? "pm"));
  if (!person || !backlogId || !absence?.id) return null;
  const from = { day: absence.start, half: absence.startHalf ?? "am" } as const;
  const to = { day: absence.end, half: absence.endHalf ?? "pm" } as const;
  const days = absentWorkingDays([absence], clicked.personId, absence.start, absence.end);
  const id = absence.id;
  return (
    <div className={cn(BAR, "border-[var(--danger)] bg-[color-mix(in_oklch,var(--danger)_8%,var(--surface))]")} role="group" aria-label="Retirer une absence">
      <span><b className="font-semibold">{person.name}</b> : absent {spanLabel(from, to)} ({countLabel(days, "j ouvré", "j ouvrés", formatPoints)})</span>
      <span className="ml-auto" />
      <button type="button" disabled={pending} onClick={() => onHalf(id, backlogId)} className={cn(BUTTON, "border-[var(--danger)] text-[var(--danger)]")}>
        Retirer {clicked.slot.half === "am" ? "le matin" : "l’après-midi"} du {formatDay(clicked.slot.day)}
      </button>
      <button type="button" disabled={pending} onClick={() => onDay(backlogId)} className={cn(BUTTON, "border-[var(--danger)] text-[var(--danger)]")}>Retirer la journée</button>
      <button type="button" disabled={pending} onClick={() => onAll(id, backlogId)} className={cn(BUTTON, "border-[var(--danger)] text-[var(--danger)]")}>Retirer toute l’absence</button>
      <button type="button" onClick={onClose} className={BUTTON}>Fermer</button>
    </div>
  );
}

function SelectionBar({ selection, outcome, person, backlogId, pending, onDeclare, onRemove, onClose }: {
  selection: Selection;
  outcome: ReturnType<typeof selectionOutcome>;
  person: PresencePerson | undefined;
  backlogId: string | null;
  pending: boolean;
  onDeclare: (backlogId: string) => void;
  onRemove: (backlogId: string) => void;
  onClose: () => void;
}) {
  if (!person || !backlogId || outcome.kind === "empty") return null;
  const span = `${spanLabel(selection.from, selection.to)}, ${countLabel(outcome.days, "j ouvré", "j ouvrés", formatPoints)}`;
  if (outcome.kind === "mixed") {
    return (
      <div className={cn(BAR, "border-[var(--status-doing)] bg-[color-mix(in_oklch,var(--status-doing)_12%,var(--surface))]")} role="group" aria-label="Sélection">
        <span><b className="font-semibold">{person.name}</b> : la sélection mêle des demi-journées absentes et présentes. Glisse sur des cases vides pour déclarer, sur des cases rouges pour retirer.</span>
        <span className="ml-auto" />
        <button type="button" onClick={onClose} className={BUTTON}>Annuler</button>
      </div>
    );
  }
  const remove = outcome.kind === "remove";
  return (
    <div className={cn(BAR, remove ? "border-[var(--danger)] bg-[color-mix(in_oklch,var(--danger)_8%,var(--surface))]" : "border-[var(--status-doing)] bg-[color-mix(in_oklch,var(--status-doing)_12%,var(--surface))]")} role="group" aria-label={remove ? "Retirer la sélection" : "Déclarer une absence"}>
      <span><b className="font-semibold">{person.name}</b> : {remove ? "retirer l’absence" : "absent"} {span}</span>
      <span className="ml-auto" />
      {remove ? (
        <button type="button" disabled={pending} onClick={() => onRemove(backlogId)} className={cn(BUTTON, "border-[var(--danger)] text-[var(--danger)]")}>Retirer</button>
      ) : (
        <button type="button" disabled={pending} onClick={() => onDeclare(backlogId)} className={cn(BUTTON, PRIMARY)}>Enregistrer</button>
      )}
      <button type="button" onClick={onClose} className={BUTTON}>Annuler</button>
    </div>
  );
}

function when(ticket: PresenceTicket, today: Day): string {
  const days = countLabel(ticketWorkingDays(ticket, today), "j ouvré", "j ouvrés");
  const dates = ticket.doneAt ? `${formatDay(ticket.startedAt)} → ${formatDay(ticket.doneAt)} · ${days}` : `depuis le ${formatDay(ticket.startedAt)} · ${days}`;
  return ticket.historyIncomplete ? `${dates} · dates approximatives` : dates;
}

function TicketRows({ rows, today }: { rows: { ticket: PresenceTicket; person?: PresencePerson }[]; today: Day }) {
  if (rows.length === 0) return <p className="px-3 py-2 text-xs text-muted-foreground">Aucun ticket sur cette période.</p>;
  return (
    <ul className="divide-y divide-border">
      {rows.map(({ ticket, person }) => (
        <ItemRow
          key={`${ticket.id}-${person?.id ?? ""}`}
          as="li"
          href={`/b/${ticket.backlogKey}?item=${ticket.key}`}
          item={{
            id: ticket.id, key: ticket.key, title: ticket.title, type: ticket.type, kind: ticket.kind ?? null,
            status: { name: ticket.statusName ?? CATEGORY_LABEL[ticket.statusCategory], category: ticket.statusCategory },
            estimatePoints: ticket.points,
            ...(person ? { assigneeId: person.id, assigneeName: person.name } : {}),
          }}
          aside={<span className="text-xs tabular-nums text-muted-foreground">{when(ticket, today)}</span>}
        />
      ))}
    </ul>
  );
}

function PanelView({ page, panel, people, developers, onClose }: {
  page: PresencePage;
  panel: Panel;
  people: Map<string, PresencePerson>;
  developers: PresencePerson[];
  onClose: () => void;
}) {
  const { data, scope } = page;
  const backlog = scopeBacklog(data, scope);
  // The tickets active over the panel's bounds; the points, only those done within them.
  const bounds = panel.kind === "sprint" ? { from: panel.sprint.start, to: panel.sprint.end ?? data.today } : { from: panel.from, to: panel.to };
  let title: ReactNode;
  let rows: { ticket: PresenceTicket; person?: PresencePerson }[];
  let link: ReactNode = null;
  if (panel.kind === "sprint") {
    rows = developers.flatMap((person) =>
      ticketsOf(data, person.id, scope).filter((ticket) => activeIn(ticket, bounds.from, bounds.to, data.today)).map((ticket) => ({ ticket, person })));
    title = <>{panel.sprint.name} <span className="font-normal text-muted-foreground">· du {formatDay(panel.sprint.start)}{panel.sprint.end ? ` au ${formatDay(panel.sprint.end)}` : ""}</span></>;
    if (backlog) link = <Link href={`/b/${backlog.key}/reports?report=sprint&sprint=${panel.sprint.id}`} className={LINK}>Voir le rapport de sprint</Link>;
  } else {
    const person = people.get(panel.personId);
    if (!person) return null;
    rows = ticketsOf(data, person.id, scope)
      .filter((ticket) => activeIn(ticket, bounds.from, bounds.to, data.today))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .map((ticket) => ({ ticket }));
    title = <>{person.name} <span className="font-normal text-muted-foreground">· {panel.label}</span></>;
    const key = backlog?.key ?? backlogsOf(data, person.id)[0]?.key;
    if (key) link = <Link href={`/b/${key}?view=list&assignee=${encodeURIComponent(person.id)}`} className={LINK}>Voir dans la Liste</Link>;
  }
  const points = rows
    .filter(({ ticket }) => ticket.doneAt !== null && ticket.doneAt >= bounds.from && ticket.doneAt <= bounds.to)
    .reduce((total, { ticket }) => total + (ticket.points ?? 0), 0);
  rows.sort((a, b) => b.ticket.startedAt.localeCompare(a.ticket.startedAt));
  return (
    <section className="rounded-[var(--radius)] border border-border bg-[var(--surface)]" aria-label="Tickets">
      <h2 className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border bg-[var(--surface-2)] px-3 py-2 text-[13px] font-semibold">
        {title}
        <span className="font-normal text-muted-foreground">· {countLabel(rows.length, "ticket", "tickets")}, {formatPoints(points)} pts terminés</span>
        <span className="ml-auto inline-flex items-center gap-3">
          {link}
          <button type="button" onClick={onClose} className={LINK}>Fermer</button>
        </span>
      </h2>
      <TicketRows rows={rows} today={data.today} />
    </section>
  );
}

type DeclareInput = { userId: string; backlogId: string; startDate: Day; startHalf: Half; endDate: Day; endHalf: Half };

/**
 * Declaring without the mouse: the person and the first and last half-days
 * in a form, the keyboard's and the screen reader's way to what a drag does.
 * The fields are those of Le point's form.
 */
function DeclareDialog({ page, people, open, onOpenChange, pending, error, onDeclare }: {
  page: PresencePage;
  people: PresencePerson[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  error: string | null;
  onDeclare: (input: DeclareInput) => void;
}) {
  const { data } = page;
  const editable = people.filter((person) => rightsBacklogFor(data, person.id) !== null);
  const firstDay = isWorkingDay(data.today) ? data.today : nextWorkingDay(data.today);
  const [userId, setUserId] = useState(editable.some((person) => person.id === data.viewerId) ? data.viewerId : editable[0]?.id ?? "");
  const [startDate, setStartDate] = useState<Day>(firstDay);
  const [startHalf, setStartHalf] = useState<Half>("am");
  const [endDate, setEndDate] = useState<Day>(firstDay);
  const [endHalf, setEndHalf] = useState<Half>("pm");
  if (editable.length === 0) return null;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const backlogId = rightsBacklogFor(data, userId);
    if (backlogId) onDeclare({ userId, backlogId, startDate, startHalf, endDate, endHalf });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger className={BUTTON}>Déclarer une absence</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Déclarer une absence</DialogTitle>
          <DialogDescription>D’une demi-journée ouvrée à une autre, bornes incluses ; les week-ends et les jours fériés ne comptent pas.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3 text-[13px]">
          <div className="flex items-center gap-2">
            <span className="w-24 shrink-0">Personne</span>
            <select aria-label="Personne" value={userId} onChange={(event) => setUserId(event.target.value)} className={cn(FIELD, "min-w-0 flex-1")}>
              {editable.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-24 shrink-0">Premier jour</span>
            <input type="date" required aria-label="Premier jour" value={startDate} onChange={(event) => setStartDate(event.target.value)} className={FIELD} />
            <select aria-label="Début" value={startHalf} onChange={(event) => setStartHalf(event.target.value as Half)} className={FIELD}>
              <option value="am">matin</option>
              <option value="pm">après-midi</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-24 shrink-0">Dernier jour</span>
            <input type="date" required aria-label="Dernier jour" value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} className={FIELD} />
            <select aria-label="Fin" value={endHalf} onChange={(event) => setEndHalf(event.target.value as Half)} className={FIELD}>
              <option value="am">matin</option>
              <option value="pm">après-midi</option>
            </select>
          </div>
          {error ? <p role="alert" className="text-xs text-[var(--danger)]">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => onOpenChange(false)} className={BUTTON}>Annuler</button>
            <button type="submit" disabled={pending} className={cn(BUTTON, PRIMARY)}>Enregistrer</button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RulesDialog() {
  return (
    <Dialog>
      <DialogTrigger
        className="inline-grid size-[30px] place-items-center rounded-[var(--radius)] border border-border bg-[var(--surface)] font-serif text-xs font-semibold text-muted-foreground hover:text-foreground"
        aria-label="Comment c’est compté"
      >
        i
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Comment c’est compté</DialogTitle>
          <DialogDescription>Les règles de la page, les mêmes que dans Le point et le Bilan des sprints.</DialogDescription>
        </DialogHeader>
        <ul className="list-disc space-y-1.5 pl-5 text-sm">
          <li>Une absence va d’une demi-journée ouvrée à une autre, bornes incluses ; chaque demi-journée ouvrée compte 0,5 j. Les week-ends et les jours fériés français ne comptent jamais. Deux absences ne se chevauchent pas.</li>
          <li>Une absence vaut pour tous les backlogs de la personne ; elle est hachurée tant qu’elle n’est pas passée. Chacun déclare les siennes ; un administrateur d’un backlog, celles de ses membres.</li>
          <li>Un ticket commence le jour où il passe « En cours » et finit le jour où il passe « Terminé », pour la personne à qui il est assigné aujourd’hui ; il traverse les week-ends, les fériés et les absences sans s’interrompre, mais sa barre y pâlit : il reste ouvert, personne n’y travaille. La catégorie actuelle d’un statut vaut pour tout son historique ; « dates approximatives » signale un journal incomplet.</li>
          <li>Développement : une personne assignée à un ticket aujourd’hui ou au cours des douze derniers mois ; Produit sinon. Rien n’est réglé à la main.</li>
          <li>Les totaux comptent les demi-journées ouvrées d’absence et les tickets terminés dans la période, sur la portée affichée.</li>
        </ul>
      </DialogContent>
    </Dialog>
  );
}
