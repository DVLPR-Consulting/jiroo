"use client";

import Link from "next/link";
import { useEffect, useId, useState, type ReactNode } from "react";
import { TypeIcon } from "@/components/icons/type-icon";
import { ItemRow } from "@/components/items/item-row";
import { PageHeader } from "@/components/shell/page-header";
import { PageToolbar } from "@/components/shell/page-toolbar";
import { Badge } from "@/components/ui/badge";
import { personLight, sprintLight, type Light, type LightColor } from "@/lib/le-point/lights";
import {
  daysFrom,
  developerView,
  formatDay,
  productView,
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
      <PageToolbar>
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
function Rows({ cards, backlogKey, showAssignee = false }: {
  cards: LePointCard[];
  backlogKey: string;
  showAssignee?: boolean;
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

/** A thin bar with its figure, for the sprint's two percentages. */
function Meter({ label, percent, className }: { label: string; percent: number; className: string }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)_3rem] items-center gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span role="img" aria-label={`${label} : ${percent} %`} className="flex h-1.5 overflow-hidden rounded-full bg-[var(--muted)]">
        <span className={className} style={{ width: `${percent}%` }} />
      </span>
      <span className="text-right tabular-nums">{percent} %</span>
    </div>
  );
}

/**
 * The sprint's light (JIR-124 proof of concept): time elapsed against work
 * done, scope added and blocked tickets, as Jira's « Sprint health » gadget
 * reads them, with the facts behind the colour and the rules on request.
 */
function SprintLightCard({ data }: { data: LePointDataset }) {
  const headingId = useId();
  const light = sprintLight(data);
  const title = (
    <h2 id={headingId} className="t-h3">
      Santé du sprint
    </h2>
  );
  const prototype = (
    <Badge variant="outline" className="h-5 px-1.5 text-[11px] font-normal text-muted-foreground">
      prototype
    </Badge>
  );
  if (!light || !data.sprint) {
    return (
      <section
        aria-labelledby={headingId}
        className="flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-dashed border-border px-3 py-2"
      >
        {title}
        {prototype}
        <span className="text-sm text-muted-foreground">Aucun sprint actif : rien à évaluer.</span>
      </section>
    );
  }
  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "@container space-y-2 rounded-[var(--radius)] border border-border border-l-4 bg-card p-3 shadow-[var(--shadow-sm)]",
        EDGE_CLASS[light.color],
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {title}
        <Verdict light={light} size="lg" />
        {prototype}
        <Link href={`/b/${data.backlog.key}/reports?report=burndown`} className="ml-auto text-xs text-[var(--primary)] underline">
          Voir le burndown
        </Link>
      </div>
      <p className="text-sm">
        <span className="font-medium">{data.sprint.name}</span> · {light.summary}
      </p>
      {light.color !== "none" ? (
        <div className="grid gap-x-6 gap-y-1 @xl:grid-cols-2">
          <Meter label="Temps écoulé" percent={light.elapsedPercent} className="bg-[var(--muted-foreground)]" />
          <Meter
            label={light.unit === "points" ? "Points terminés" : "Tickets terminés"}
            percent={light.donePercent}
            className="bg-[var(--status-done)]"
          />
        </div>
      ) : null}
      <ul className="space-y-0.5 text-xs text-muted-foreground">
        {light.details.map((detail) => <li key={detail}>{detail}</li>)}
      </ul>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer font-medium hover:text-foreground">Comment est-ce calculé ?</summary>
        <div className="mt-1 space-y-1">
          <p>
            Écart = % du temps écoulé (jours calendaires du sprint) − % des points terminés sur le périmètre actuel ;
            en tickets si rien n’est estimé.
          </p>
          <p>
            En retard au-delà de 25 points d’écart. À surveiller au-delà de 10, ou si plus de 20 % de l’engagement
            initial a été ajouté en cours de sprint, ou dès qu’un ticket est bloqué. En bonne voie sinon, et en avance
            quand le travail terminé devance le temps de plus de 10 points.
          </p>
          <p>
            Par personne : Disponible sans ticket en cours ; À surveiller après 3 jours ouvrés sans activité sur un
            ticket en cours, ou avec un ticket bloqué ; En difficulté quand plus rien n’a bougé depuis 5 jours ouvrés,
            ou avec 4 tickets en cours à la fois.
          </p>
        </div>
      </details>
    </section>
  );
}

/** A person's light in the workload row: the verdict in a pill, the facts in its tooltip. */
function LightTag({ light }: { light: Light }) {
  return (
    <Verdict light={light} title={[light.summary, ...light.details].join("\n")}>
      <span className="sr-only"> : {light.summary}</span>
    </Verdict>
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
      <SprintLightCard data={data} />
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
      {team ? (
        <Section id="le-point-charge" title="Charge par personne" count={view.workload.length} empty="Aucun ticket ouvert.">
          <Workload rows={view.workload} data={data} />
        </Section>
      ) : null}
    </div>
  );
}

/**
 * Open tickets per person, as Jira's team workload: a light (JIR-124), a bar
 * against the busiest, then the counts. The four columns need the list itself
 * to be wide enough (a container query, since the sidebar eats the viewport);
 * narrower, the counts take a second line and the bar goes.
 */
function Workload({ rows, data }: { rows: WorkloadRow[]; data: LePointDataset }) {
  const busiest = Math.max(...rows.map((row) => row.open));
  return (
    <ul className="@container overflow-hidden rounded-[var(--radius)] border border-border bg-card">
      {rows.map((row) => {
        const label = [
          `${row.open} ouvert${row.open > 1 ? "s" : ""}`,
          row.inProgress > 0 ? `${row.inProgress} en cours` : null,
          row.blocked > 0 ? `${row.blocked} bloqué${row.blocked > 1 ? "s" : ""}` : null,
        ].filter(Boolean).join(", ");
        const light = row.assignee === null ? null : personLight(data, row.assignee);
        return (
          <li
            key={row.assignee ?? "unassigned"}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-b border-border px-3 py-2 text-sm last:border-b-0 @2xl:grid-cols-[minmax(0,1fr)_7.5rem_12rem_11rem]"
          >
            <span className={cn("min-w-0 truncate", row.assignee === null && "text-muted-foreground")}>{row.name}</span>
            <span className="justify-self-end @2xl:justify-self-start">{light ? <LightTag light={light} /> : null}</span>
            <span aria-hidden="true" className="hidden h-1.5 overflow-hidden rounded-full bg-[var(--muted)] @2xl:flex">
              <span className="bg-[var(--status-doing)]" style={{ width: `${(row.open / busiest) * 100}%` }} />
            </span>
            <span className="col-span-2 text-xs tabular-nums text-muted-foreground @2xl:col-span-1">
              {label}
            </span>
          </li>
        );
      })}
    </ul>
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
      <SprintLightCard data={data} />
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
