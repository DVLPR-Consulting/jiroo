"use client";

import Link from "next/link";
import { useEffect, useId, useState, type ReactNode } from "react";
import { TypeIcon } from "@/components/icons/type-icon";
import { ItemRow } from "@/components/items/item-row";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import {
  daysFrom,
  developerView,
  formatDay,
  productView,
  type LePointCard,
  type LePointDataset,
  type ObjectiveSummary,
  type Tone,
} from "@/lib/le-point/model";
import { recordVisit, VISIT_COOKIE } from "@/lib/le-point/visit";
import { cn } from "@/lib/utils";

export type Perspective = "developer" | "product";

export const PERSPECTIVE_STORAGE_KEY = "jiroo:le-point:perspective";

const PERSPECTIVES: { value: Perspective; label: string }[] = [
  { value: "developer", label: "Développement" },
  { value: "product", label: "Produit" },
];

const TONE_CLASS: Record<Tone, string> = {
  danger: "text-[color-mix(in_oklch,var(--danger)_80%,var(--foreground))] bg-[color-mix(in_oklch,var(--danger)_14%,transparent)]",
  warning: "text-[color-mix(in_oklch,var(--warning)_70%,var(--foreground))] bg-[color-mix(in_oklch,var(--warning)_18%,transparent)]",
  neutral: "text-muted-foreground bg-[var(--muted)]",
  success: "text-[color-mix(in_oklch,var(--status-done)_75%,var(--foreground))] bg-[var(--status-done-bg)]",
};

function readPerspective(): Perspective | null {
  try {
    const stored = window.localStorage.getItem(PERSPECTIVE_STORAGE_KEY);
    return stored === "developer" || stored === "product" ? stored : null;
  } catch {
    return null;
  }
}

function writePerspective(perspective: Perspective) {
  try {
    window.localStorage.setItem(PERSPECTIVE_STORAGE_KEY, perspective);
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
 * reason it is there in a few words; a row opens the real item panel. It
 * writes nothing, and the perspective is a reading preference, never a
 * permission.
 */
export function LePointView({ data }: { data: LePointDataset }) {
  const [perspective, setPerspective] = useState<Perspective>("developer");

  // The remembered choice only exists in the browser: apply it after hydration.
  useEffect(() => {
    const stored = readPerspective();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored) setPerspective(stored);
  }, []);

  // The visit is recorded once shown, so the next one knows what changed since.
  useEffect(() => {
    const value = recordVisit(readCookie(VISIT_COOKIE), data.today);
    // Every backlog's Le point shares the device's last visit.
    document.cookie = `${VISIT_COOKIE}=${value}; path=/; max-age=31536000; samesite=lax`;
  }, [data.today]);

  function choose(next: Perspective) {
    setPerspective(next);
    writePerspective(next);
  }

  const viewerId = perspective === "developer" ? data.personas.developer : data.personas.product;

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
        description={
          <>
            {perspective === "developer"
              ? "Ce que tu reprends, ce qui te bloque et ce qui arrive."
              : "Les décisions qu’on attend de toi, l’avancement des objectifs et la prochaine livraison."}{" "}
            Lecture seule.
          </>
        }
        actions={<PerspectiveSwitch value={perspective} onChange={choose} />}
      />

      <div className="px-4 sm:px-6">
        {perspective === "developer" ? (
          <DeveloperPerspective data={data} viewerId={viewerId} />
        ) : (
          <ProductPerspective data={data} viewerId={viewerId} />
        )}
      </div>
    </div>
  );
}

function PerspectiveSwitch({ value, onChange }: { value: Perspective; onChange: (value: Perspective) => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="Perspective"
      className="inline-flex rounded-[var(--radius)] border border-border bg-[var(--surface-2)] p-0.5"
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const next = value === "developer" ? "product" : "developer";
        onChange(next);
        event.currentTarget.querySelector<HTMLElement>(`[data-value="${next}"]`)?.focus();
      }}
    >
      {PERSPECTIVES.map((option) => {
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
      {cards.map((card) => (
        <ItemRow
          key={card.key}
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

function DeveloperPerspective({ data, viewerId }: { data: LePointDataset; viewerId: string }) {
  const view = developerView(data, { kind: "me", viewerId });
  const key = data.backlog.key;
  // The « À venir » figure counts its own late tickets; a late one in progress says so in its tag.
  const lateNext = view.next.filter((card) => card.due && card.due < data.today).length;
  const since = data.firstVisit ? "ces 7 derniers jours" : `depuis le ${formatDay(data.lastVisit)}`;
  return (
    <div className="space-y-6">
      <Tiles>
        <Tile label="En cours" value={view.resume.length} hint="à reprendre maintenant" target="le-point-reprendre" />
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

      <Section id="le-point-reprendre" title="À reprendre maintenant" count={view.resume.length} empty="Aucun ticket en cours. Choisis-en un dans « À venir ».">
        <Rows cards={view.resume} backlogKey={key} />
      </Section>
      <Section id="le-point-bloque" title="Ce qui te bloque" count={view.blocked.length} empty="Rien ne te bloque en ce moment.">
        <Rows cards={view.blocked} backlogKey={key} />
      </Section>
      <Section id="le-point-ensuite" title="À venir" count={view.next.length} empty="Aucun ticket à faire avec une échéance.">
        <Rows cards={view.next} backlogKey={key} />
      </Section>
      {view.withoutDue.length > 0 ? (
        <details>
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
            Sans échéance ({view.withoutDue.length})
          </summary>
          <div className="mt-2">
            <Rows cards={view.withoutDue} backlogKey={key} />
          </div>
        </details>
      ) : null}
      <Section
        id="le-point-recent"
        title={data.firstVisit ? "Ces 7 derniers jours" : "Depuis ta dernière visite"}
        count={view.recent.length}
        empty={`Rien n’a changé pour toi ${since}.`}
      >
        <Rows cards={view.recent} backlogKey={key} />
      </Section>
    </div>
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

function ProductPerspective({ data, viewerId }: { data: LePointDataset; viewerId: string }) {
  const view = productView(data, { kind: "me", viewerId });
  const key = data.backlog.key;
  const release = view.nextRelease;
  const remaining = release?.planned ? daysFrom(data.today, release.planned) : null;
  const active = view.objectives.filter(started);
  const waiting = view.objectives.filter((objective) => !started(objective));
  return (
    <div className="space-y-6">
      <Tiles>
        <Tile
          label="Décisions à prendre"
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

      <Section id="le-point-decisions" title="Décisions qui t’attendent" count={view.decisions.length} empty="Personne ne t’a demandé de décision.">
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
