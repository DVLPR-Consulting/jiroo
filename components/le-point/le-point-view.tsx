"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { Fragment, useEffect, useId, useState, useTransition, type ReactNode } from "react";
import { declareAbsenceAction, removeAbsenceAction } from "@/app/actions/absences";
import { TypeIcon } from "@/components/icons/type-icon";
import { ItemRow } from "@/components/items/item-row";
import { InitialsAvatar } from "@/components/jiroo/avatar";
import { PageHeader } from "@/components/shell/page-header";
import { PageToolbar } from "@/components/shell/page-toolbar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { LABEL_HUES, type LabelHue } from "@/lib/design/constants";
import { countLabel, formatPoints, frenchPlural } from "@/lib/format/plural";
import { halfName, type Half } from "@/lib/dates/half-days";
import { absentUntil } from "@/lib/le-point/absences";
import { sprintForecast, sprintPeople } from "@/lib/le-point/forecast";
import { personLight, sprintLight, SPRINT_THRESHOLDS, workloadTickets, type Light, type LightColor, type SprintLight } from "@/lib/le-point/lights";
import {
  daysFrom,
  developerView,
  formatDay,
  productView,
  teamWorkload,
  type LePointCard,
  type LePointDataset,
  type LePointScope,
  type ObjectiveSummary,
  type Tone,
  type WorkloadRow,
} from "@/lib/le-point/model";
import { recordVisit, VISIT_COOKIE } from "@/lib/le-point/visit";
import { cn } from "@/lib/utils";

export type Perspective = "developer" | "product";
export type Scope = LePointScope["kind"];

export const PERSPECTIVE_STORAGE_KEY = "jiroo:le-point:perspective";
export const SCOPE_STORAGE_KEY = "jiroo:le-point:scope";

const PERSPECTIVES: { value: Perspective; label: string }[] = [
  { value: "developer", label: "Développement" },
  { value: "product", label: "Produit" },
];

const SCOPES: { value: Scope; label: string }[] = [
  { value: "team", label: "Toute l’équipe" },
  { value: "me", label: "Moi" },
];

const DESCRIPTIONS: Record<Perspective, Record<Scope, string>> = {
  developer: {
    team: "Ce que l’équipe a en cours, ce qui la bloque et ce qui arrive.",
    me: "Ce que tu reprends, ce qui te bloque et ce qui arrive.",
  },
  product: {
    team: "Les décisions en attente, l’avancement des objectifs et la prochaine livraison.",
    me: "Les décisions qu’on attend de toi, l’avancement des objectifs et la prochaine livraison.",
  },
};

const TONE_CLASS: Record<Tone, string> = {
  danger: "text-[color-mix(in_oklch,var(--danger)_80%,var(--foreground))] bg-[color-mix(in_oklch,var(--danger)_14%,transparent)]",
  warning: "text-[color-mix(in_oklch,var(--warning)_70%,var(--foreground))] bg-[color-mix(in_oklch,var(--warning)_18%,transparent)]",
  neutral: "text-muted-foreground bg-[var(--muted)]",
  success: "text-[color-mix(in_oklch,var(--status-done)_75%,var(--foreground))] bg-[var(--status-done-bg)]",
};

function readChoice<T extends string>(key: string, options: { value: T }[]): T | null {
  try {
    const stored = window.localStorage.getItem(key);
    return options.find((option) => option.value === stored)?.value ?? null;
  } catch {
    return null;
  }
}

function writeChoice(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // A private window keeps the choice for this visit only.
  }
}

function readCookie(name: string) {
  return document.cookie.split("; ").find((pair) => pair.startsWith(`${name}=`))?.slice(name.length + 1);
}

/**
 * The real ticket's panel: in place, on this backlog's Le point, or on its
 * own backlog for a dependency elsewhere (its key's prefix).
 */
export function ticketHref(key: string, backlogKey: string) {
  const owner = key.slice(0, key.lastIndexOf("-"));
  return owner === backlogKey ? `/b/${owner}/le-point?item=${key}` : `/b/${owner}?item=${key}`;
}

/** « Leo R. » */
function shortName(name: string) {
  const [first, ...rest] = name.trim().split(/\s+/);
  const last = rest.at(-1);
  return last ? `${first} ${last.charAt(0)}.` : first ?? name;
}

/**
 * « Le point » (JIR-107): the project at a glance, as Jira's project Summary,
 * through two perspectives on the same facts. A summary strip answers « where
 * are we », then lists of tickets in the Backlog's own rows, each with the
 * reason it is there in a few words; a row opens the real item panel. The
 * whole team is shown by default, as Jira's Summary; « Moi » keeps the
 * reader's own tickets (JIR-121). It writes nothing, and perspective and scope
 * are reading preferences, never permissions.
 */
export function LePointView({ data }: { data: LePointDataset }) {
  const [perspective, setPerspective] = useState<Perspective>("developer");
  const [scopeKind, setScopeKind] = useState<Scope>("team");

  // The remembered choices only exist in the browser: apply them after hydration.
  useEffect(() => {
    const storedPerspective = readChoice(PERSPECTIVE_STORAGE_KEY, PERSPECTIVES);
    const storedScope = readChoice(SCOPE_STORAGE_KEY, SCOPES);
    /* eslint-disable react-hooks/set-state-in-effect */
    if (storedPerspective) setPerspective(storedPerspective);
    if (storedScope) setScopeKind(storedScope);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // The visit is recorded once shown, so the next one knows what changed since.
  useEffect(() => {
    const value = recordVisit(readCookie(VISIT_COOKIE), data.today);
    // Every backlog's Le point shares the device's last visit.
    document.cookie = `${VISIT_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`;
  }, [data.today]);

  function choosePerspective(next: Perspective) {
    setPerspective(next);
    writeChoice(PERSPECTIVE_STORAGE_KEY, next);
  }

  function chooseScope(next: Scope) {
    setScopeKind(next);
    writeChoice(SCOPE_STORAGE_KEY, next);
  }

  const scope: LePointScope = scopeKind === "team"
    ? { kind: "team" }
    : { kind: "me", viewerId: perspective === "developer" ? data.personas.developer : data.personas.product };

  return (
    <div className="pb-10">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            Le point
            <Badge variant="outline" className="h-5 px-1.5 text-[11px] font-normal text-muted-foreground">
              pilote
            </Badge>
          </span>
        }
        description={<>{DESCRIPTIONS[perspective][scopeKind]} Lecture seule.</>}
      />
      {/* The sprint's card is everyone's: above the controls, which only drive the lists below. */}
      <div className="px-4 pb-4 sm:px-6">
        <SprintHealthCard data={data} />
      </div>
      <PageToolbar className="border-t pt-3">
        <ChoiceSwitch label="Perspective" options={PERSPECTIVES} value={perspective} onChange={choosePerspective} />
        <ChoiceSwitch label="Portée" options={SCOPES} value={scopeKind} onChange={chooseScope} />
      </PageToolbar>

      <div className="px-4 pt-4 sm:px-6">
        {perspective === "developer" ? (
          <DeveloperPerspective data={data} scope={scope} />
        ) : (
          <ProductPerspective data={data} scope={scope} />
        )}
      </div>
    </div>
  );
}

/** A segmented choice; the arrow keys move between its options. */
function ChoiceSwitch<T extends string>({ label, options, value, onChange }: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-[var(--radius)] border border-border bg-[var(--surface-2)] p-0.5"
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const index = options.findIndex((option) => option.value === value);
        const step = event.key === "ArrowRight" ? 1 : -1;
        const next = options[(index + step + options.length) % options.length]!.value;
        onChange(next);
        event.currentTarget.querySelector<HTMLElement>(`[data-value="${next}"]`)?.focus();
      }}
    >
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            data-value={option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "rounded-[calc(var(--radius)-2px)] px-3 py-1 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
              checked ? "bg-[var(--surface)] text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** One figure of the summary strip, leading to the section that lists exactly those tickets. */
function Tile({ label, value, hint, hintTone = "neutral", tone = "neutral", target }: {
  label: string;
  value: ReactNode;
  hint?: string;
  hintTone?: Tone;
  tone?: Tone;
  target: string;
}) {
  return (
    <a
      href={`#${target}`}
      className="rounded-[var(--radius)] border border-border bg-card p-3 shadow-[var(--shadow-sm)] outline-none transition-colors hover:bg-[var(--muted)]/60 focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
    >
      <span className="block text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "mt-1 block truncate text-xl font-semibold tabular-nums",
          tone === "danger" && "text-[var(--danger)]",
          tone === "warning" && "text-[color-mix(in_oklch,var(--warning)_75%,var(--foreground))]",
        )}
      >
        {value}
      </span>
      {hint ? (
        <span className={cn("mt-0.5 block truncate text-xs", hintTone === "danger" ? "text-[var(--danger)]" : "text-muted-foreground")}>
          {hint}
        </span>
      ) : null}
    </a>
  );
}

function Tiles({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>;
}

function Section({ id, title, count, empty, children }: {
  id: string;
  title: ReactNode;
  count?: number;
  empty: string;
  children: ReactNode;
}) {
  const headingId = useId();
  const hasContent = count === undefined ? children !== null : count > 0;
  return (
    <section id={id} aria-labelledby={headingId} className="scroll-mt-4 space-y-2">
      <h2 id={headingId} className="t-h3 flex items-baseline gap-2">
        {title}
        {count !== undefined && count > 0 ? (
          <span className="text-xs font-normal text-muted-foreground tabular-nums">{count}</span>
        ) : null}
      </h2>
      {hasContent ? (
        children
      ) : (
        <p className="rounded-[var(--radius)] border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
          {empty}
        </p>
      )}
    </section>
  );
}

/** The reason in a few words; the row's tooltip gives the full sentence. */
function Tag({ card }: { card: LePointCard }) {
  return (
    <span
      className={cn("inline-flex max-w-56 items-center truncate rounded px-1.5 py-0.5 text-[11px] font-medium", TONE_CLASS[card.tone])}
    >
      {card.tag}
    </span>
  );
}

/** Tickets in the Backlog's own rows; the tag says why each is here, the row opens it. */
function Rows({ cards, backlogKey, showAssignee = false, showDue = false }: {
  cards: LePointCard[];
  backlogKey: string;
  showAssignee?: boolean;
  showDue?: boolean;
}) {
  return (
    <ul className="overflow-hidden rounded-[var(--radius)] border border-border bg-card">
      {cards.map((card, index) => (
        <ItemRow
          // A team's decisions may list one ticket once per person asked.
          key={`${card.key}-${index}`}
          as="li"
          href={ticketHref(card.key, backlogKey)}
          item={{
            id: card.key,
            key: card.key,
            title: card.title,
            type: card.shape === "subtask" ? "soustache" : "tache",
            kind: card.shape === "bug" ? "bug" : null,
            status: { name: card.status, category: card.category },
            ...(showDue ? { dueDate: card.due } : {}),
          }}
          linkTitle={card.reason}
          // Under the row's link: clicking the tag or the name opens the ticket too.
          aside={
            <>
              {showAssignee ? (
                <span className="text-xs text-muted-foreground">
                  {card.assigneeName ? shortName(card.assigneeName) : "Sans assigné"}
                </span>
              ) : null}
              <Tag card={card} />
            </>
          }
        />
      ))}
    </ul>
  );
}

const DOT_CLASS: Record<LightColor, string> = {
  green: "bg-[var(--status-done)]",
  amber: "bg-[var(--warning)]",
  red: "bg-[var(--danger)]",
  none: "border border-border bg-[var(--surface-2)]",
};

/** The card's left edge takes the sprint's colour, so the verdict is seen before it is read. */
const EDGE_CLASS: Record<LightColor, string> = {
  green: "border-l-[var(--status-done)]",
  amber: "border-l-[var(--warning)]",
  red: "border-l-[var(--danger)]",
  none: "border-l-border",
};

/** The light itself: a dot in its colour; the text beside it carries the meaning. */
function LightDot({ color, className = "size-2.5" }: { color: LightColor; className?: string }) {
  return <span aria-hidden="true" className={cn("inline-block shrink-0 rounded-full", className, DOT_CLASS[color])} />;
}

/** The verdict in words, in a pill of its colour: the sprint's in large, a person's in small. */
function Verdict({ light, size = "sm", title, children }: { light: Light; size?: "sm" | "lg"; title?: string; children?: ReactNode }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center rounded-full ring-1 ring-inset ring-[color-mix(in_oklch,currentColor_25%,transparent)]",
        size === "lg" ? "gap-2 px-3 py-1 text-sm font-semibold" : "gap-1.5 px-2 py-0.5 text-xs font-medium",
        TONE_CLASS[light.tone],
      )}
    >
      <LightDot color={light.color} className={size === "lg" ? "size-3" : "size-2"} />
      {light.label}
      {children}
    </span>
  );
}

/** A person's light in the workload row: the fact in a pill, the details in its tooltip. */
function LightTag({ light }: { light: Light }) {
  return (
    <Verdict light={light} title={[light.summary, ...light.details].join("\n")}>
      <span className="sr-only"> : {light.summary}</span>
    </Verdict>
  );
}

/** Today's mark on the bar takes the verdict's colour. */
const MARKER_CLASS: Record<LightColor, string> = {
  green: "bg-[var(--status-done)]",
  amber: "bg-[var(--warning)]",
  red: "bg-[var(--danger)]",
  none: "bg-border",
};
const MARKER_TEXT: Record<LightColor, string> = {
  green: "text-[color-mix(in_oklch,var(--status-done)_75%,var(--foreground))]",
  amber: "text-[color-mix(in_oklch,var(--warning)_70%,var(--foreground))]",
  red: "text-[var(--danger)]",
  none: "text-muted-foreground",
};

function Swatch({ className }: { className: string }) {
  return <i aria-hidden="true" className={cn("mr-1.5 inline-block size-2.5 rounded-[3px] align-[-1px]", className)} />;
}

/**
 * The sprint's scope as one bar, done then under way, with today's mark in
 * the verdict's colour: Jira's sprint progress bar, the time elapsed drawn on
 * it. The mark's label stays within the bar's edges.
 */
function SprintBar({ light }: { light: SprintLight }) {
  const todo = Math.max(0, 100 - light.donePercent - light.doingPercent);
  return (
    <div className="space-y-1">
      <div className="relative h-3.5">
        <div
          role="img"
          aria-label={`${light.donePercent} % terminé, ${light.doingPercent} % en cours, ${todo} % à faire ; ${light.elapsedPercent} % du temps écoulé`}
          className="absolute inset-0 flex overflow-hidden rounded-full bg-[var(--surface)] shadow-[inset_0_0_0_1px_var(--border)]"
        >
          <span className="h-full bg-[var(--status-done)]" style={{ width: `${light.donePercent}%` }} />
          <span className="h-full bg-[var(--status-doing)]" style={{ width: `${light.doingPercent}%` }} />
        </div>
        <span
          aria-hidden="true"
          className={cn("absolute -top-1.5 -bottom-1.5 -ml-[1.5px] w-[3px] rounded-sm", MARKER_CLASS[light.color])}
          style={{ left: `${light.elapsedPercent}%` }}
        />
      </div>
      {/* The label hangs from the mark: centred, or flush with it near either edge, so it never leaves the bar. */}
      <div className="relative h-4">
        <span
          className={cn(
            "absolute whitespace-nowrap text-[11px] font-semibold",
            light.elapsedPercent > 25 && light.elapsedPercent < 75 && "-translate-x-1/2",
            light.elapsedPercent >= 75 && "-translate-x-full",
            MARKER_TEXT[light.color],
          )}
          style={{ left: `${light.elapsedPercent}%` }}
        >
          Aujourd’hui · {light.elapsedPercent} % du temps
        </span>
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span><Swatch className="bg-[var(--status-done)]" />Terminé {light.donePercent} %</span>
        <span><Swatch className="bg-[var(--status-doing)]" />En cours {light.doingPercent} %</span>
        <span><Swatch className="bg-[var(--surface)] shadow-[inset_0_0_0_1px_var(--border)]" />À faire {todo} %</span>
      </p>
    </div>
  );
}

/** One figure of the card: the number, its unit beside it, one line under it. With `onClick`, a button that opens a panel. */
function HealthTile({ value, unit, line, tone = "neutral", onClick, expanded = false }: {
  value: ReactNode;
  unit?: string;
  line: ReactNode;
  tone?: Tone;
  onClick?: () => void;
  expanded?: boolean;
}) {
  const content = (
    <>
      <span
        className={cn(
          "block text-[22px] font-semibold leading-tight tracking-tight tabular-nums",
          tone === "danger" && "text-[var(--danger)]",
          tone === "warning" && "text-[color-mix(in_oklch,var(--warning)_75%,var(--foreground))]",
        )}
      >
        {value}
        {unit ? <span className="ml-1 text-[13px] font-medium text-muted-foreground">{unit}</span> : null}
      </span>
      <span className="mt-0.5 block text-xs text-muted-foreground">{line}</span>
    </>
  );
  const className = "rounded-[var(--radius)] border border-border bg-[var(--surface-2)] px-3 py-2.5";
  if (!onClick) return <div className={className}>{content}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      className={cn(
        className,
        "flex w-full flex-col items-stretch justify-start text-left outline-none transition-colors hover:bg-[var(--muted)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        expanded && "bg-[var(--muted)] ring-1 ring-inset ring-foreground",
      )}
    >
      {content}
    </button>
  );
}

/**
 * The sprint's scope, on request: was the commitment realistic, against the
 * average velocity; where the scope stands today; and every ticket added or
 * removed since the start, dated and signed, as the sprint report lists them.
 */
function ScopePanel({ data, light }: { data: LePointDataset; light: SprintLight }) {
  const sprint = data.sprint;
  if (!sprint) return null;
  const people = new Map(data.people.map((person) => [person.id, person.name]));
  const changes = sprint.changes ?? [];
  const added = changes.filter((change) => change.kind === "added").length;
  const removed = changes.length - added;
  const commitment = sprint.commitment;
  const velocity = sprint.velocity ?? null;
  const bars = light.unit === "points" && commitment
    ? [
        { label: "Engagement au démarrage", value: commitment.points, className: "bg-[var(--status-todo)]" },
        ...(velocity === null ? [] : [{ label: "Vélocité moyenne, 3 derniers sprints", value: velocity, className: "bg-[var(--status-done)]" }]),
        { label: "Périmètre aujourd’hui", value: light.total, className: "bg-[var(--status-doing)]" },
      ]
    : [];
  const scale = Math.max(1, ...bars.map((bar) => bar.value));
  const since = changes.length === 0
    ? "aucun changement depuis"
    : `depuis, ${[
        added > 0 ? countLabel(added, "ajouté", "ajoutés") : null,
        removed > 0 ? countLabel(removed, "retiré", "retirés") : null,
      ].filter((part) => part !== null).join(" et ")}`;
  const start = commitment
    ? `${countLabel(commitment.tickets, "ticket embarqué", "tickets embarqués")} au démarrage ; ${since}.`
    : `Engagement initial inconnu, le sprint a démarré avant que ces faits soient gardés ; ${since}.`;
  // Rounded to the hundredth before it is worded, so the agreement follows the figure shown.
  const points = (value: number) => countLabel(Math.round(value * 100) / 100, "point", "points", formatPoints);
  const verdict = velocity === null
    ? " Pas encore de vélocité calculable sur les derniers sprints clos."
    : light.unit !== "points" || !commitment
      ? ""
      : commitment.points > velocity
        ? ` L’engagement dépasse de ${points(commitment.points - velocity)} la vélocité moyenne.`
        : commitment.points < velocity
          ? ` L’engagement est sous la vélocité moyenne de ${points(velocity - commitment.points)}.`
          : " L’engagement est égal à la vélocité moyenne.";
  return (
    <div className="space-y-2 rounded-[var(--radius)] border border-border bg-[var(--surface-2)] px-3 py-2 text-[13px]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium">Périmètre du sprint</span>
        <Link href={`/b/${data.backlog.key}/reports?report=sprint`} className="ml-auto text-xs text-[var(--primary)] underline">
          Voir le rapport de sprint
        </Link>
      </div>
      {bars.length > 0 ? (
        <div className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 text-xs">
          {bars.map((bar) => (
            <Fragment key={bar.label}>
              <span className="text-muted-foreground">{bar.label}</span>
              <span role="img" aria-label={`${bar.label} : ${countLabel(bar.value, "pt", "pts", formatPoints)}`} className="flex h-2 overflow-hidden rounded-full bg-[var(--muted)]">
                <span className={bar.className} style={{ width: `${(bar.value / scale) * 100}%` }} />
              </span>
              <span className="font-medium tabular-nums">{countLabel(bar.value, "pt", "pts", formatPoints)}</span>
            </Fragment>
          ))}
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">{start}{verdict}</p>
      {changes.length > 0 ? (
        <ul className="overflow-hidden rounded-[var(--radius)] border border-border bg-card">
          {changes.map((change, index) => (
            <li key={`${change.key}-${index}`} className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 border-b border-border px-2.5 py-1.5 last:border-b-0">
              <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium", change.kind === "added" ? TONE_CLASS.success : TONE_CLASS.neutral)}>
                {change.kind === "added" ? "Ajouté" : "Retiré"}
              </span>
              <Link href={ticketHref(change.key, data.backlog.key)} className="font-mono text-[11.5px] font-medium text-muted-foreground hover:underline">
                {change.key}
              </Link>
              {/* The title keeps a readable width; the facts wrap under it when the row is narrow. */}
              <span className="min-w-[10rem] flex-1 truncate">{change.title}</span>
              <span className="text-xs text-muted-foreground">
                {change.points === null ? "non estimé" : countLabel(change.points, "pt", "pts", formatPoints)} · le {formatDay(change.day)}
                {` par ${(change.actor && people.get(change.actor)) ?? "quelqu’un"}`}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * The rules behind the card, on request, behind a small « i »: the sprint's
 * verdict, the forecast, each person's light. The button is the dialog's
 * trigger, so the focus comes back to it on close.
 */
function RulesDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="Comment est-ce calculé ?"
          title="Comment est-ce calculé ?"
          className="inline-grid size-[18px] place-items-center rounded-full border border-border bg-[var(--surface)] text-[11px] font-semibold leading-none text-muted-foreground outline-none hover:border-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
        >
          <span aria-hidden="true">i</span>
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Comment est-ce calculé ?</DialogTitle>
          <DialogDescription className="sr-only">Les règles de la santé du sprint et de la charge par personne.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            <strong className="font-medium text-foreground">Sprint.</strong> Écart = % du temps écoulé (jours calendaires du
            sprint) − % des points terminés sur le périmètre actuel ; en tickets si rien n’est estimé. En retard au-delà de
            25 points d’écart. À surveiller au-delà de 10, ou si plus de 20 % de l’engagement initial a été ajouté en cours
            de sprint, ou dès qu’un ticket est bloqué. En bonne voie sinon, et en avance quand le travail terminé devance le
            temps de plus de 10 points.
          </p>
          <p>
            <strong className="font-medium text-foreground">Va-t-on finir ?</strong> Ce qui reste, rapporté aux jours ouvrés
            restants et aux personnes présentes ; le rythme jusqu’ici est le terminé rapporté aux jours-personne écoulés.
            Sans absences déclarées, chaque membre du backlog est présent ; sans la liste des membres, est présente
            toute personne qui tient un ticket ouvert du sprint.
          </p>
          <p>
            <strong className="font-medium text-foreground">Par personne.</strong> La pastille dit le fait et sa couleur le
            niveau : rien en cours ; orange dès qu’un ticket en cours est sans activité depuis 3 jours ouvrés, ou qu’un
            ticket est bloqué ; rouge quand plus rien n’a bougé depuis 5 jours ouvrés, ou avec 4 tickets en cours à la
            fois ; en rythme sinon. Les tickets à faire hors du sprint actif comptent dans les ouverts, pas dans la
            pastille ; un ticket en cours y compte même hors sprint. Les jours ouvrés vont du lundi au vendredi, hors
            jours fériés français. Les absences déclarées, en demi-journées, ne comptent ni dans l’inactivité d’un ticket
            ni dans les jours-personne du sprint ; une personne absente une demi-journée reste présente ce jour-là.
          </p>
          <p>Un ticket sans activité connue n’est jamais compté comme inactif. Prototype : les seuils sont fixés dans le code.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * « Santé du sprint » (JIR-124): the sprint at a glance, as Jira's Sprint
 * health gadget, read top to bottom: the verdict, the scope on a bar with
 * today's mark, whether it can finish, four figures, then the team's load.
 * The same card for everyone, whatever the perspective or the scope.
 */
function SprintHealthCard({ data }: { data: LePointDataset }) {
  const headingId = useId();
  const [scopeOpen, setScopeOpen] = useState(false);
  const light = sprintLight(data);
  const rows = teamWorkload(data);
  const forecast = sprintForecast(data, sprintPeople(data));
  const title = <h2 id={headingId} className="sr-only">Santé du sprint</h2>;
  const prototype = (
    <Badge variant="outline" className="h-5 px-1.5 text-[11px] font-normal text-muted-foreground">
      prototype
    </Badge>
  );
  const rules = <RulesDialog />;
  const sprint = data.sprint;
  if (!light || !sprint) {
    return (
      <section aria-labelledby={headingId} className="@container space-y-3 rounded-[var(--radius)] border border-dashed border-border px-3 py-2">
        {title}
        <div className="flex flex-wrap items-center gap-2">
          <span className="t-h3">Santé du sprint</span>
          {prototype}
          <span className="text-sm text-muted-foreground">Aucun sprint actif : rien à évaluer.</span>
          {rules}
        </div>
        <WorkloadStrip rows={rows} data={data} />
      </section>
    );
  }
  const span = daysFrom(sprint.start, sprint.end);
  const position = daysFrom(sprint.start, data.today);
  const timing = position < 0
    ? `commence le ${formatDay(sprint.start)}`
    : position > span
      ? `fin prévue le ${formatDay(sprint.end)}, dépassée de ${countLabel(position - span, "jour", "jours")}`
      : `jour ${position + 1} sur ${span + 1} · fin le ${formatDay(sprint.end)}`;
  const figureTone: Tone = light.tone === "danger" || light.tone === "warning" ? light.tone : "neutral";
  // The journal's changes, the ones the scope panel lists; the amber rule still reads the scope added and still here.
  const changes = sprint.changes ?? [];
  const added = changes.filter((change) => change.kind === "added").length;
  const removed = changes.length - added;
  // The journal stays reachable even once the last ticket left the sprint: that is what explains the empty scope.
  const scopeTile = (
    <HealthTile
      tone={light.added.percent > SPRINT_THRESHOLDS.scopeAdded ? "warning" : "neutral"}
      value={added > 0 && removed > 0 ? `+${added} · −${removed}` : removed > 0 ? `−${removed}` : `+${added}`}
      unit={added > 0 && removed > 0 ? undefined : removed > 0 ? frenchPlural(removed, "retiré", "retirés") : frenchPlural(added, "ajouté", "ajoutés")}
      line={changes.length > 0 ? (
        <>
          {added > 0 && removed > 0 ? "de périmètre, " : ""}{light.added.percent} % de l’engagement initial ·{" "}
          <span className="text-[var(--primary)] underline">{scopeOpen ? "fermer" : "voir"}</span>
        </>
      ) : "aucun changement depuis le début du sprint"}
      onClick={changes.length > 0 ? () => setScopeOpen((value) => !value) : undefined}
      expanded={scopeOpen}
    />
  );
  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "@container space-y-3 rounded-[var(--radius)] border border-border border-l-4 bg-card p-3 shadow-[var(--shadow-sm)]",
        EDGE_CLASS[light.color],
      )}
    >
      {title}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Verdict light={light} size="lg" title={light.summary}>
          <span className="sr-only"> : {light.summary}</span>
        </Verdict>
        <span className="text-sm">
          <span className="font-medium">{sprint.name}</span> <span className="text-muted-foreground">· {timing}</span>
        </span>
        {prototype}
        {rules}
        <Link href={`/b/${data.backlog.key}/reports?report=burndown`} className="ml-auto text-xs text-[var(--primary)] underline">
          Voir le burndown
        </Link>
      </div>
      {sprint.goal ? (
        <p className="-mt-1 text-[13px] text-muted-foreground">
          Objectif : <span className="font-medium text-foreground">{sprint.goal}</span>
        </p>
      ) : null}
      {light.color === "none" ? (
        <>
          <p className="text-sm text-muted-foreground">{light.summary}</p>
          {changes.length > 0 ? <div className="grid grid-cols-2 gap-2.5 @xl:grid-cols-4">{scopeTile}</div> : null}
          {scopeOpen ? <ScopePanel data={data} light={light} /> : null}
        </>
      ) : (
        <>
          <SprintBar light={light} />
          {forecast ? <p className="text-sm">{forecast.sentence}</p> : null}
          <div className="grid grid-cols-2 gap-2.5 @xl:grid-cols-4">
            <HealthTile
              tone={figureTone}
              value={formatPoints(light.done)}
              unit={`/ ${formatPoints(light.total)} ${light.unit === "points" ? frenchPlural(light.total, "pt", "pts") : frenchPlural(light.total, "ticket", "tickets")}`}
              line={light.unit === "points"
                ? `${light.tickets.done} sur ${countLabel(light.tickets.total, "ticket", "tickets")}${light.tickets.unestimated > 0 ? ` · ${countLabel(light.tickets.unestimated, "non estimé", "non estimés")}` : ""}`
                : "aucun ticket estimé : comptés en tickets"}
            />
            <HealthTile
              tone={light.blocked.length > 0 ? "danger" : "neutral"}
              value={light.blocked.length}
              unit={frenchPlural(light.blocked.length, "bloqué", "bloqués")}
              line={light.blocked.length > 0 ? light.blocked.join(", ") : "aucun ticket n’attend un autre ticket"}
            />
            {scopeTile}
            {forecast?.overdue ? (
              <HealthTile tone="danger" value={`+${position - span} j`} line="au-delà de la fin prévue" />
            ) : (
              <HealthTile
                value={forecast ? `${forecast.daysLeft} j` : "—"}
                unit={forecast ? frenchPlural(forecast.daysLeft, "ouvré restant", "ouvrés restants") : "ouvré restant"}
                line={forecast
                  ? `${countLabel(forecast.personDaysLeft, "jour-personne", "jours-personne", formatPoints)}, ${countLabel(forecast.present, "personne présente", "personnes présentes")}`
                  : "aucun ticket dans le sprint"}
              />
            )}
          </div>
          {scopeOpen ? <ScopePanel data={data} light={light} /> : null}
        </>
      )}
      <WorkloadStrip rows={rows} data={data} />
    </section>
  );
}

function DeveloperPerspective({ data, scope }: { data: LePointDataset; scope: LePointScope }) {
  const view = developerView(data, scope);
  const team = scope.kind === "team";
  const key = data.backlog.key;
  // The « À venir » figure counts its own late tickets; a late one in progress says so in its tag.
  const lateNext = view.next.filter((card) => card.due && card.due < data.today).length;
  const since = data.firstVisit ? "ces 7 derniers jours" : `depuis le ${formatDay(data.lastVisit)}`;
  return (
    <div className="space-y-6">
      <Tiles>
        <Tile label="En cours" value={view.resume.length} hint={team ? "dans l’équipe" : "à reprendre maintenant"} target="le-point-reprendre" />
        <Tile
          label="Bloqués"
          value={view.blocked.length}
          hint="en attente d’un autre ticket"
          tone={view.blocked.length > 0 ? "danger" : "neutral"}
          target="le-point-bloque"
        />
        <Tile
          label="À venir"
          value={view.next.length}
          hint={lateNext > 0 ? `dont ${lateNext} en retard` : "avec une échéance"}
          hintTone={lateNext > 0 ? "danger" : "neutral"}
          target="le-point-ensuite"
        />
        <Tile label="Terminés ou débloqués" value={view.recent.length} hint={since} target="le-point-recent" />
      </Tiles>

      <Section
        id="le-point-reprendre"
        title={team ? "En cours" : "À reprendre maintenant"}
        count={view.resume.length}
        empty={team ? "Aucun ticket en cours dans l’équipe." : "Aucun ticket en cours. Choisis-en un dans « À venir »."}
      >
        <Rows cards={view.resume} backlogKey={key} showAssignee={team} />
      </Section>
      <Section
        id="le-point-bloque"
        title={team ? "Ce qui bloque l’équipe" : "Ce qui te bloque"}
        count={view.blocked.length}
        empty={team ? "Rien ne bloque l’équipe en ce moment." : "Rien ne te bloque en ce moment."}
      >
        <Rows cards={view.blocked} backlogKey={key} showAssignee={team} />
      </Section>
      <Section id="le-point-ensuite" title="À venir" count={view.next.length} empty="Aucun ticket à faire avec une échéance.">
        <Rows cards={view.next} backlogKey={key} showAssignee={team} />
      </Section>
      {view.withoutDue.length > 0 ? (
        <details>
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
            Sans échéance ({view.withoutDue.length})
          </summary>
          <div className="mt-2">
            <Rows cards={view.withoutDue} backlogKey={key} showAssignee={team} />
          </div>
        </details>
      ) : null}
      <Section
        id="le-point-recent"
        title={data.firstVisit ? "Ces 7 derniers jours" : "Depuis ta dernière visite"}
        count={view.recent.length}
        empty={team ? `Rien n’a changé dans le projet ${since}.` : `Rien n’a changé pour toi ${since}.`}
      >
        <Rows cards={view.recent} backlogKey={key} showAssignee={team} />
      </Section>
    </div>
  );
}

function hueFor(value: string): LabelHue {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) | 0;
  return LABEL_HUES[Math.abs(hash) % LABEL_HUES.length]!;
}

/** « 3 ouverts, 1 en cours, 1 bloqué » */
function countsLabel(row: WorkloadRow) {
  return [
    `${row.open} ouvert${row.open > 1 ? "s" : ""}`,
    row.inProgress > 0 ? `${row.inProgress} en cours` : null,
    row.blocked > 0 ? `${row.blocked} bloqué${row.blocked > 1 ? "s" : ""}` : null,
  ].filter(Boolean).join(", ");
}

/**
 * The team's load inside the card, as Jira's Sprint health lists the
 * assignees: one chip per person, the colour of their light and their open
 * tickets. Nothing is open at first; a chip opens the person, « Tout voir »
 * gives the full table. The members without an open ticket stay out of both:
 * the forecast alone counts them present (JIR-124).
 */
function WorkloadStrip({ rows, data }: { rows: WorkloadRow[]; data: LePointDataset }) {
  const [open, setOpen] = useState<string | null>(null);
  const [table, setTable] = useState(false);
  const panelId = useId();
  const current = open === null ? null : rows.find((row) => (row.assignee ?? "unassigned") === open) ?? null;
  return (
    <div className="space-y-2 border-t border-border pt-3">
      <div className="flex items-center gap-2">
        <h3 className="text-[13px] font-semibold">
          Charge par personne <span className="text-xs font-normal text-muted-foreground tabular-nums">{rows.length}</span>
        </h3>
        <Link href={`/presences?backlog=${encodeURIComponent(data.backlog.key)}`} className="ml-auto text-xs text-[var(--primary)] underline">
          Calendrier d’équipe
        </Link>
        {rows.length > 0 ? (
          <button type="button" onClick={() => setTable((value) => !value)} className="text-xs text-[var(--primary)] underline">
            {table ? "Réduire" : "Tout voir"}
          </button>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Aucun ticket ouvert.</p>
      ) : table ? (
        <Workload rows={rows} data={data} />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {rows.map((row) => {
              const id = row.assignee ?? "unassigned";
              const light = row.assignee === null ? null : personLight(data, row.assignee);
              const isOpen = open === id;
              const away = row.assignee === null ? null : absentUntil(data.absences ?? [], row.assignee, data.today);
              return (
                <button
                  key={id}
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  aria-label={`${row.name}, ${light ? `${light.label}, ` : ""}${countLabel(row.open, "ticket ouvert", "tickets ouverts")}`}
                  onClick={() => setOpen(isOpen ? null : id)}
                  className={cn(
                    "inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-[var(--surface)] py-1 pr-3 pl-1 text-[13px] outline-none transition-colors hover:bg-[var(--muted)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                    isOpen && "bg-[var(--muted)] ring-1 ring-inset ring-foreground",
                    (row.assignee === null || away !== null) && "border-dashed text-muted-foreground",
                  )}
                >
                  {row.assignee ? (
                    <span className="shrink-0">
                      <InitialsAvatar name={row.name} hue={hueFor(row.assignee)} size={24} />
                    </span>
                  ) : (
                    <span aria-hidden="true" className="inline-grid size-6 place-items-center rounded-full bg-[var(--muted)] text-xs">?</span>
                  )}
                  <span className="min-w-0 truncate">{row.assignee ? shortName(row.name) : row.name}</span>
                  {light ? <LightDot color={light.color} className="size-2" /> : null}
                  <span className="shrink-0 text-muted-foreground tabular-nums">
                    {away ? `en congé jusqu’au ${formatDay(away)}` : row.open}
                  </span>
                </button>
              );
            })}
          </div>
          {current ? (
            <div id={panelId}>
              <PersonDetail row={current} data={data} />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

/** A person's tickets, each with why it counts, and the way to the Liste filtered on them. */
function PersonDetail({ row, data }: { row: WorkloadRow; data: LePointDataset }) {
  const light = row.assignee === null ? null : personLight(data, row.assignee);
  const listHref = `/b/${data.backlog.key}?view=list&assignee=${encodeURIComponent(row.assignee ?? "none")}`;
  return (
    <div className="space-y-2 rounded-[var(--radius)] border border-border bg-[var(--surface-2)] px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
        <span className="font-medium">{row.name}</span>
        {light ? <LightTag light={light} /> : null}
        <span className="text-xs text-muted-foreground">{countsLabel(row)}</span>
        <Link href={listHref} className="ml-auto text-xs text-[var(--primary)] underline">
          Voir dans la Liste
        </Link>
      </div>
      <AbsencePanel key={row.assignee ?? "unassigned"} row={row} data={data} />
      <Rows cards={workloadTickets(data, row.assignee)} backlogKey={data.backlog.key} showDue />
    </div>
  );
}

const DATE_INPUT_CLASS = "rounded border border-border bg-[var(--surface)] px-1.5 py-0.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]";

/** « Absent du 3 nov. après-midi au 6 nov. », « Absent le 5 nov. matin ». */
function absenceLabel(absence: { start: string; end: string; startHalf?: Half; endHalf?: Half }): string {
  const startHalf = absence.startHalf ?? "am";
  const endHalf = absence.endHalf ?? "pm";
  if (absence.start === absence.end) {
    return startHalf === endHalf ? `Absent le ${formatDay(absence.start)} ${halfName(startHalf)}` : `Absent le ${formatDay(absence.start)}`;
  }
  return `Absent du ${formatDay(absence.start)}${startHalf === "pm" ? " après-midi" : ""} au ${formatDay(absence.end)}${endHalf === "am" ? " matin" : ""}`;
}

/**
 * The person's absences from today on, and the way to declare one
 * (JIR-124): one's own from any backlog one may browse, a member's for the
 * backlog's administrators. Whole days, both ends included; the page
 * reloads its facts once the server has them.
 */
function AbsencePanel({ row, data }: { row: WorkloadRow; data: LePointDataset }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [declaring, setDeclaring] = useState(false);
  const [startDate, setStartDate] = useState(data.today);
  const [startHalf, setStartHalf] = useState<Half>("am");
  const [endDate, setEndDate] = useState(data.today);
  const [endHalf, setEndHalf] = useState<Half>("pm");
  const person = row.assignee;
  const backlogId = data.backlog.id;
  if (!person || !backlogId) return null;
  const mine = person === data.personas.developer;
  const allowed = mine || data.canManageAbsences === true;
  const upcoming = (data.absences ?? []).filter((absence) => absence.user === person && absence.end >= data.today);
  if (!allowed && upcoming.length === 0) return null;
  const run = (action: () => Promise<{ ok: true } | { ok: false; error: string }>) =>
    startTransition(async () => {
      setError(null);
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDeclaring(false);
      router.refresh();
    });
  return (
    <div className="space-y-1.5 text-xs">
      {upcoming.length > 0 ? (
        <ul className="flex flex-wrap gap-x-3 gap-y-1">
          {upcoming.map((absence) => (
            <li key={absence.id ?? `${absence.start}-${absence.end}`} className="inline-flex items-center gap-1.5 text-muted-foreground">
              {absenceLabel(absence)}
              {allowed && absence.id ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => removeAbsenceAction({ id: absence.id!, backlogId }))}
                  className="text-[var(--primary)] underline disabled:opacity-60"
                >
                  Retirer
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {allowed ? (
        declaring ? (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              run(() => declareAbsenceAction({ userId: person, backlogId, startDate, startHalf, endDate, endHalf }));
            }}
          >
            <span>{mine ? "Mon absence, du" : `Absence de ${row.name}, du`}</span>
            <input type="date" required aria-label="Premier jour" value={startDate} onChange={(event) => setStartDate(event.target.value)} className={DATE_INPUT_CLASS} />
            <select aria-label="Début" value={startHalf} onChange={(event) => setStartHalf(event.target.value as Half)} className={DATE_INPUT_CLASS}>
              <option value="am">matin</option>
              <option value="pm">après-midi</option>
            </select>
            <span>au</span>
            <input type="date" required aria-label="Dernier jour" value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} className={DATE_INPUT_CLASS} />
            <select aria-label="Fin" value={endHalf} onChange={(event) => setEndHalf(event.target.value as Half)} className={DATE_INPUT_CLASS}>
              <option value="am">matin</option>
              <option value="pm">après-midi</option>
            </select>
            <button type="submit" disabled={pending} className="rounded bg-[var(--primary)] px-2 py-0.5 font-medium text-white disabled:opacity-60">
              Enregistrer
            </button>
            <button type="button" onClick={() => setDeclaring(false)} className="text-muted-foreground underline">
              Annuler
            </button>
          </form>
        ) : (
          <button type="button" onClick={() => setDeclaring(true)} className="text-[var(--primary)] underline">
            Déclarer une absence
          </button>
        )
      ) : null}
      {error ? <p role="alert" className="text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}

/**
 * The full table, as Jira's team workload: a light, a bar against the
 * busiest, then the counts. The four columns need the list itself to be wide
 * enough (a container query, since the sidebar eats the viewport); narrower,
 * the counts take a second line and the bar goes.
 */
function Workload({ rows, data }: { rows: WorkloadRow[]; data: LePointDataset }) {
  const busiest = Math.max(1, ...rows.map((row) => row.open));
  return (
    <ul className="@container overflow-hidden rounded-[var(--radius)] border border-border bg-card">
      {rows.map((row) => (
        <WorkloadPerson key={row.assignee ?? "unassigned"} row={row} busiest={busiest} data={data} />
      ))}
    </ul>
  );
}

/**
 * One row of the table. The facts behind an amber or red light stay in the
 * row, nobody has to hover to know; the row itself opens the person.
 */
function WorkloadPerson({ row, busiest, data }: { row: WorkloadRow; busiest: number; data: LePointDataset }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const light = row.assignee === null ? null : personLight(data, row.assignee);
  const facts = light && (light.color === "amber" || light.color === "red")
    ? (light.details.length > 1 ? light.details.slice(1).join(" ") : light.summary)
    : null;
  return (
    <li className="border-b border-border last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-3 py-2 text-left text-sm outline-none transition-colors hover:bg-[var(--muted)]/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)] @2xl:grid-cols-[minmax(0,1fr)_14rem_7rem_11rem]"
      >
        <span className={cn("flex min-w-0 items-center gap-1.5", row.assignee === null && "text-muted-foreground")}>
          <ChevronRight aria-hidden="true" className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
          <span className="min-w-0 truncate">{row.name}</span>
        </span>
        <span className="justify-self-end @2xl:justify-self-start">{light ? <LightTag light={light} /> : null}</span>
        <span aria-hidden="true" className="hidden h-1.5 overflow-hidden rounded-full bg-[var(--muted)] @2xl:flex">
          <span className="bg-[var(--status-doing)]" style={{ width: `${(row.open / busiest) * 100}%` }} />
        </span>
        <span className="col-span-2 text-xs tabular-nums text-muted-foreground @2xl:col-span-1">
          {countsLabel(row)}
        </span>
        {facts ? (
          <span className="col-span-2 pl-[1.375rem] text-xs text-muted-foreground @2xl:col-span-4">{facts}</span>
        ) : null}
      </button>
      {open ? (
        <div id={panelId} className="border-t border-border px-3 py-2">
          <PersonDetail row={row} data={data} />
        </div>
      ) : null}
    </li>
  );
}

const started = (objective: ObjectiveSummary) => objective.done + objective.inProgress + objective.blocked > 0;

/** One line per objective: its progress bar, its count and its delivery. */
function ObjectiveTable({ objectives, backlogKey }: { objectives: ObjectiveSummary[]; backlogKey: string }) {
  return (
    <ul className="overflow-hidden rounded-[var(--radius)] border border-border bg-card">
      {objectives.map((objective) => {
        const parts = [
          { count: objective.done, tone: "bg-[var(--status-done)]" },
          { count: objective.inProgress, tone: "bg-[var(--status-doing)]" },
          { count: objective.blocked, tone: "bg-[var(--danger)]" },
        ];
        const label = [
          `${objective.done} terminé${objective.done > 1 ? "s" : ""} sur ${objective.total}`,
          objective.inProgress > 0 ? `${objective.inProgress} en cours` : null,
          objective.blocked > 0 ? `${objective.blocked} bloqué${objective.blocked > 1 ? "s" : ""}` : null,
        ].filter(Boolean).join(", ");
        return (
          <li
            key={objective.key}
            className="relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-border px-3 py-2 last:border-b-0 hover:bg-[var(--muted)]/60 sm:grid-cols-[minmax(0,1fr)_8rem_5.5rem_11rem]"
          >
            <Link
              href={ticketHref(objective.key, backlogKey)}
              className="flex min-w-0 items-center gap-2 outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-[var(--ring)]"
            >
              <TypeIcon type="epic" />
              <span className="shrink-0 font-mono text-[11.5px] font-medium text-muted-foreground">{objective.key}</span>
              <span className="min-w-0 truncate text-sm">{objective.title}</span>
            </Link>
            <span
              role="img"
              aria-label={label}
              title={label}
              className="hidden h-1.5 overflow-hidden rounded-full bg-[var(--muted)] sm:flex"
            >
              {parts.map((part, index) =>
                part.count > 0 ? (
                  <span key={index} className={part.tone} style={{ width: `${(part.count / objective.total) * 100}%` }} />
                ) : null,
              )}
            </span>
            <span className="text-right text-xs tabular-nums text-muted-foreground sm:text-left">
              {objective.done}/{objective.total}
              {objective.blocked > 0 ? <span className="ml-1 text-[var(--danger)]">· {objective.blocked} bloqué{objective.blocked > 1 ? "s" : ""}</span> : null}
            </span>
            <span className="col-span-2 truncate text-xs text-muted-foreground sm:col-span-1" title={objective.delivery}>
              {objective.due ? `${formatDay(objective.due)} · ` : ""}
              {objective.deliveryTag}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function ProductPerspective({ data, scope }: { data: LePointDataset; scope: LePointScope }) {
  const view = productView(data, scope);
  const team = scope.kind === "team";
  const key = data.backlog.key;
  const release = view.nextRelease;
  const remaining = release?.planned ? daysFrom(data.today, release.planned) : null;
  const active = view.objectives.filter(started);
  const waiting = view.objectives.filter((objective) => !started(objective));
  return (
    <div className="space-y-6">
      <Tiles>
        <Tile
          label={team ? "Décisions en attente" : "Décisions à prendre"}
          value={view.decisions.length}
          hint="demandées par une mention"
          tone={view.decisions.length > 0 ? "warning" : "neutral"}
          target="le-point-decisions"
        />
        <Tile label="Objectifs en cours" value={active.length} hint={`sur ${view.objectives.length} à livrer`} target="le-point-objectifs" />
        <Tile
          label="En difficulté"
          value={view.difficulties.length}
          hint="bloqués ou sans assigné"
          tone={view.difficulties.length > 0 ? "danger" : "neutral"}
          target="le-point-difficultes"
        />
        <Tile
          label="Prochaine livraison"
          value={release ? release.name : "—"}
          hint={release?.planned
            ? `${formatDay(release.planned)}${remaining !== null && remaining > 0 ? `, dans ${remaining} jour${remaining > 1 ? "s" : ""}` : ""}`
            : release ? "sans date" : "aucune prévue"}
          target="le-point-livraison"
        />
      </Tiles>

      <Section
        id="le-point-decisions"
        title={team ? "Décisions en attente" : "Décisions qui t’attendent"}
        count={view.decisions.length}
        empty={team ? "Aucune décision en attente." : "Personne ne t’a demandé de décision."}
      >
        <Rows cards={view.decisions} backlogKey={key} showAssignee />
      </Section>

      <Section
        id="le-point-objectifs"
        title={<>Objectifs <span className="text-xs font-normal text-muted-foreground">(epics)</span></>}
        count={view.objectives.length}
        empty="Aucun objectif à livrer dans ce backlog."
      >
        <div className="space-y-2">
          {active.length > 0 ? <ObjectiveTable objectives={active} backlogKey={key} /> : null}
          {waiting.length > 0 ? (
            <details open={active.length === 0}>
              <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                Pas encore commencés ({waiting.length})
              </summary>
              <div className="mt-2">
                <ObjectiveTable objectives={waiting} backlogKey={key} />
              </div>
            </details>
          ) : null}
          <p className="text-xs text-muted-foreground">Les échéances sont des dates prévues, pas des garanties.</p>
        </div>
      </Section>

      <Section id="le-point-difficultes" title="Ce qui met un objectif en difficulté" count={view.difficulties.length} empty="Aucun objectif n’est en difficulté.">
        <Rows cards={view.difficulties} backlogKey={key} showAssignee />
      </Section>

      <Section
        id="le-point-livraison"
        title={<>Prochaine livraison <span className="text-xs font-normal text-muted-foreground">(release)</span></>}
        empty="Aucune livraison prévue."
      >
        {release ? (
          <div className="space-y-2 rounded-[var(--radius)] border border-border bg-card p-3 text-sm shadow-[var(--shadow-sm)]">
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium">{release.name}</span>
              <span className="text-muted-foreground">
                {release.planned ? `planifiée le ${formatDay(release.planned)}` : "sans date planifiée"} · pas encore publiée
              </span>
            </p>
            <p className="text-muted-foreground">
              {release.openCount === 0
                ? "Tout son contenu est terminé."
                : `${release.openCount} ticket${release.openCount > 1 ? "s" : ""} encore ouvert${release.openCount > 1 ? "s" : ""}.`}
            </p>
            {release.objectives.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5">
                {release.objectives.map((objective) => (
                  <li key={objective.key}>
                    <Link
                      href={ticketHref(objective.key, key)}
                      className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--accent-subtle)] px-2 py-0.5 text-xs font-medium text-[var(--accent-subtle-fg)] hover:underline"
                    >
                      <TypeIcon type="epic" size={11} />
                      {objective.title}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </Section>
    </div>
  );
}
