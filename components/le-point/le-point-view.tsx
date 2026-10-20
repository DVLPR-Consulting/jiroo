"use client";

import { X } from "lucide-react";
import { useEffect, useId, useState, type ReactNode } from "react";
import { TypeIcon } from "@/components/icons/type-icon";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  daysFrom,
  developerView,
  formatDay,
  productView,
  type Category,
  type LePointCard,
  type LePointDataset,
  type ObjectiveSummary,
} from "@/lib/le-point/model";
import { cn } from "@/lib/utils";

export type Perspective = "developer" | "product";

export const PERSPECTIVE_STORAGE_KEY = "jiroo:le-point:perspective";

const PERSPECTIVES: { value: Perspective; label: string; persona: string }[] = [
  { value: "developer", label: "Développement", persona: "développeuse" },
  { value: "product", label: "Produit", persona: "PO" },
];

const CATEGORY_TONE: Record<Category, string> = {
  todo: "bg-[var(--status-todo-bg)] text-foreground",
  in_progress: "bg-[var(--status-doing-bg)] text-foreground",
  done: "bg-[var(--status-done-bg)] text-foreground",
};

const LONG_DAY = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const BUTTON = "rounded-[var(--radius)] px-2 py-1 text-xs focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:outline-none";

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

/** The plain word, with Jiroo's own term beside it: « Objectif (epic) ». */
function Term({ children, jiroo }: { children: ReactNode; jiroo: string }) {
  return (
    <>
      {children}
      <span className="ml-1 text-xs font-normal text-muted-foreground">({jiroo})</span>
    </>
  );
}

/**
 * « Le point » (JIR-107): one screen, two perspectives on the same facts.
 * A prototype on fictional data: it reads nothing and writes nothing, and the
 * perspective is a reading preference, never a permission.
 */
export function LePointView({ data }: { data: LePointDataset }) {
  const [perspective, setPerspective] = useState<Perspective>("developer");
  const [openKey, setOpenKey] = useState<string | null>(null);

  // The remembered choice only exists in the browser: apply it after hydration.
  useEffect(() => {
    const stored = readPerspective();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored) setPerspective(stored);
  }, []);

  function choose(next: Perspective) {
    setPerspective(next);
    writePerspective(next);
  }

  const viewerId = perspective === "developer" ? data.personas.developer : data.personas.product;
  const viewer = data.people.find((person) => person.id === viewerId);
  const persona = PERSPECTIVES.find((option) => option.value === perspective)!.persona;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-6 sm:px-6 lg:py-8">
      <p
        role="note"
        className="rounded-[var(--radius)] border border-[var(--warning)] bg-[var(--status-doing-bg)] px-3 py-2 text-sm"
      >
        <strong className="font-semibold">Données de démonstration</strong> — rien n’est enregistré.
        Nous sommes le {LONG_DAY.format(new Date(`${data.today}T00:00:00Z`))}.
      </p>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="t-h1">Le point</h1>
          <p className="text-sm text-muted-foreground">
            {data.backlog.name} · vu par {viewer?.name}, {persona}
          </p>
        </div>
        <PerspectiveSwitch value={perspective} onChange={choose} />
      </header>

      {perspective === "developer" ? (
        <DeveloperPerspective data={data} viewerId={viewerId} onOpen={setOpenKey} />
      ) : (
        <ProductPerspective data={data} viewerId={viewerId} onOpen={setOpenKey} />
      )}

      <TicketPanel data={data} ticketKey={openKey} onOpen={setOpenKey} onClose={() => setOpenKey(null)} />
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

function Zone({ title, empty, children }: { title: ReactNode; empty: string; children: ReactNode[] }) {
  const id = useId();
  const items = children.filter(Boolean);
  return (
    <section aria-labelledby={id} className="space-y-2">
      <h2 id={id} className="t-h3">{title}</h2>
      {items.length > 0 ? (
        <ul className="space-y-2">{items}</ul>
      ) : (
        <p className="rounded-[var(--radius)] border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
          {empty}
        </p>
      )}
    </section>
  );
}

function TicketCard({ card, onOpen }: { card: LePointCard; onOpen: (key: string) => void }) {
  return (
    <li className="rounded-[var(--radius)] border border-border bg-card p-3 shadow-[var(--shadow-sm)]">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <TypeIcon type="tache" className="mt-0.5" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm">
            <span className="font-mono text-xs text-muted-foreground">{card.key}</span>{" "}
            <span className="font-medium">{card.title}</span>
          </p>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className={cn("rounded px-1.5 py-0.5", CATEGORY_TONE[card.category])}>{card.status}</span>
            <span>{card.assigneeName ?? "Sans assigné"}</span>
            {card.objective ? <span>Objectif : {card.objective.title}</span> : null}
          </p>
          <p className="text-sm">
            <span className="text-muted-foreground">Pourquoi je vois ceci : </span>
            {card.reason}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {card.links.map((key) => (
            <button key={key} type="button" onClick={() => onOpen(key)} className={cn(BUTTON, "border border-border hover:bg-[var(--muted)]")}>
              Ouvrir {key}
            </button>
          ))}
          <button
            type="button"
            onClick={() => onOpen(card.key)}
            aria-label={`Ouvrir ${card.key} — ${card.title}`}
            className={cn(BUTTON, "bg-[var(--primary)] font-medium text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)]")}
          >
            Ouvrir
          </button>
        </div>
      </div>
    </li>
  );
}

function cards(list: LePointCard[], onOpen: (key: string) => void) {
  return list.map((card) => <TicketCard key={card.key} card={card} onOpen={onOpen} />);
}

function DeveloperPerspective({
  data,
  viewerId,
  onOpen,
}: {
  data: LePointDataset;
  viewerId: string;
  onOpen: (key: string) => void;
}) {
  const view = developerView(data, viewerId);
  return (
    <div className="space-y-6">
      <Zone title="À reprendre maintenant" empty="Aucun ticket en cours. Choisis-en un dans « Ensuite ».">
        {cards(view.resume, onOpen)}
      </Zone>
      <Zone title="Ce qui t’empêche d’avancer" empty="Rien ne te bloque en ce moment.">
        {cards(view.blocked, onOpen)}
      </Zone>
      <Zone title="Ensuite" empty="Aucun ticket à faire avec une échéance.">
        {cards(view.next, onOpen)}
      </Zone>
      {view.withoutDue.length > 0 ? (
        <details className="rounded-[var(--radius)] border border-border bg-card px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium">Sans échéance ({view.withoutDue.length})</summary>
          <ul className="mt-2 space-y-2">{cards(view.withoutDue, onOpen)}</ul>
        </details>
      ) : null}
      <Zone title="Depuis ta dernière visite" empty={`Rien n’a changé pour toi depuis le ${formatDay(data.lastVisit)}.`}>
        {cards(view.recent, onOpen)}
      </Zone>
    </div>
  );
}

function ObjectiveRow({ objective, onOpen }: { objective: ObjectiveSummary; onOpen: (key: string) => void }) {
  const parts: { count: number; singular: string; plural: string; tone: string }[] = [
    { count: objective.done, singular: "terminé", plural: "terminés", tone: "bg-[var(--status-done)]" },
    { count: objective.inProgress, singular: "en cours", plural: "en cours", tone: "bg-[var(--status-doing)]" },
    { count: objective.blocked, singular: "bloqué", plural: "bloqués", tone: "bg-[var(--danger)]" },
    { count: objective.todo, singular: "à faire", plural: "à faire", tone: "bg-[var(--status-todo)]" },
  ];
  const summary = parts
    .filter((part) => part.count > 0)
    .map((part) => `${part.count} ${part.count > 1 ? part.plural : part.singular}`)
    .join(", ");
  return (
    <li className="space-y-2 rounded-[var(--radius)] border border-border bg-card p-3 shadow-[var(--shadow-sm)]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm">
          <TypeIcon type="epic" className="mr-1.5 inline-block align-[-2px]" />
          <span className="font-mono text-xs text-muted-foreground">{objective.key}</span>{" "}
          <span className="font-medium">{objective.title}</span>
        </p>
        <button
          type="button"
          onClick={() => onOpen(objective.key)}
          aria-label={`Ouvrir ${objective.key} — ${objective.title}`}
          className={cn(BUTTON, "border border-border hover:bg-[var(--muted)]")}
        >
          Ouvrir
        </button>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-[var(--muted)]" aria-hidden>
        {parts.map((part) =>
          part.count > 0 ? (
            <span key={part.singular} className={part.tone} style={{ width: `${(part.count / objective.total) * 100}%` }} />
          ) : null,
        )}
      </div>
      <p className="text-sm">{objective.total} tickets : {summary}.</p>
      <p className="text-xs text-muted-foreground">
        {objective.due
          ? `Échéance planifiée le ${formatDay(objective.due)} : une date prévue, pas une garantie.`
          : "Pas d’échéance planifiée."}{" "}
        {objective.delivery}
      </p>
    </li>
  );
}

function ProductPerspective({
  data,
  viewerId,
  onOpen,
}: {
  data: LePointDataset;
  viewerId: string;
  onOpen: (key: string) => void;
}) {
  const view = productView(data, viewerId);
  const release = view.nextRelease;
  const remaining = release?.planned ? daysFrom(data.today, release.planned) : null;
  return (
    <div className="space-y-6">
      <Zone title="Décisions qui t’attendent" empty="Personne ne t’a demandé de décision.">
        {cards(view.decisions, onOpen)}
      </Zone>
      <Zone title={<Term jiroo="epics">Où en sont les objectifs</Term>} empty="Aucun objectif dans ce backlog.">
        {view.objectives.map((objective) => <ObjectiveRow key={objective.key} objective={objective} onOpen={onOpen} />)}
      </Zone>
      <Zone title="Ce qui met un objectif en difficulté" empty="Aucun objectif n’est en difficulté.">
        {cards(view.difficulties, onOpen)}
      </Zone>
      <Zone title={<Term jiroo="release">Prochaine livraison</Term>} empty="Aucune livraison prévue.">
        {release
          ? [
              <li key={release.name} className="space-y-1 rounded-[var(--radius)] border border-border bg-card p-3 text-sm shadow-[var(--shadow-sm)]">
                <p className="font-medium">Livraison {release.name}</p>
                <p>
                  {release.planned
                    ? `Planifiée le ${formatDay(release.planned)}${remaining !== null && remaining > 0 ? `, dans ${remaining} jour${remaining > 1 ? "s" : ""}` : ""} ; pas encore publiée.`
                    : "Sans date planifiée ; pas encore publiée."}
                </p>
                <p>Contient : {release.objectives.map((objective) => objective.title).join(", ") || "aucun objectif"}.</p>
                <p className="text-muted-foreground">
                  {release.openCount === 0
                    ? "Tout son contenu est terminé."
                    : `${release.openCount} ticket${release.openCount > 1 ? "s" : ""} encore ouvert${release.openCount > 1 ? "s" : ""}.`}
                </p>
              </li>,
            ]
          : []}
      </Zone>
    </div>
  );
}

/** The ticket or objective, read-only, presented like the item panel. */
function TicketPanel({
  data,
  ticketKey,
  onOpen,
  onClose,
}: {
  data: LePointDataset;
  ticketKey: string | null;
  onOpen: (key: string) => void;
  onClose: () => void;
}) {
  const ticket = data.tickets.find((candidate) => candidate.key === ticketKey);
  const objective = ticket ? undefined : data.objectives.find((candidate) => candidate.key === ticketKey);
  const name = (id: string | null) => data.people.find((person) => person.id === id)?.name ?? null;
  const title = ticket ? `${ticket.key} — ${ticket.title}` : objective ? `${objective.key} — ${objective.title}` : "";
  const children = objective ? data.tickets.filter((candidate) => candidate.objective === objective.key) : [];
  const mentions = ticket ? data.mentions.filter((mention) => mention.ticket === ticket.key) : [];

  return (
    <Dialog open={ticketKey !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent variant="sheet-right" showCloseButton={false} aria-describedby={undefined} className="bg-[var(--surface)] shadow-lg">
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <span className="text-xs text-muted-foreground">Démonstration · lecture seule</span>
          <DialogClose asChild>
            <button type="button" aria-label="Fermer" className="ml-auto rounded p-1 text-muted-foreground hover:bg-[var(--muted)]">
              <X className="size-4" />
            </button>
          </DialogClose>
        </header>
        <div className="space-y-4 overflow-y-auto p-5 text-sm">
          <p aria-hidden className="t-h2">{title}</p>
          {ticket ? (
            <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2">
              <dt className="text-muted-foreground">Statut</dt>
              <dd>{ticket.status}</dd>
              <dt className="text-muted-foreground">Assigné</dt>
              <dd>{name(ticket.assignee) ?? "Personne"}</dd>
              <dt className="text-muted-foreground"><Term jiroo="epic">Objectif</Term></dt>
              <dd>{data.objectives.find((candidate) => candidate.key === ticket.objective)?.title ?? "Aucun"}</dd>
              <dt className="text-muted-foreground">Échéance</dt>
              <dd>{ticket.due ? formatDay(ticket.due) : "Aucune"}</dd>
              <dt className="text-muted-foreground">Dernière activité</dt>
              <dd>
                {ticket.lastActivity
                  ? formatDay(ticket.lastActivity)
                  : ticket.activityUnknownSince
                    ? `Aucune activité connue depuis le ${formatDay(ticket.activityUnknownSince)}`
                    : "Inconnue"}
              </dd>
              {ticket.blockedBy?.length ? (
                <>
                  <dt className="text-muted-foreground">Bloqué par</dt>
                  <dd className="space-y-1">
                    {ticket.blockedBy.map((blocker, index) =>
                      "hidden" in blocker ? (
                        <p key={`hidden-${index}`}>Un ticket que tu ne peux pas voir</p>
                      ) : (
                        <button key={blocker.key} type="button" onClick={() => onOpen(blocker.key)} className="block text-left text-[var(--primary)] underline">
                          {blocker.key}
                          {data.tickets.find((candidate) => candidate.key === blocker.key)?.category === "done" ? " (terminé)" : ""}
                        </button>
                      ),
                    )}
                  </dd>
                </>
              ) : null}
            </dl>
          ) : objective ? (
            <ul className="space-y-1">
              {children.map((child) => (
                <li key={child.key}>
                  <button type="button" onClick={() => onOpen(child.key)} className="text-left hover:underline">
                    <span className="font-mono text-xs text-muted-foreground">{child.key}</span> {child.title} — {child.status}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {mentions.length > 0 ? (
            <section className="space-y-2">
              <h3 className="t-h3">Commentaires</h3>
              {mentions.map((mention) => (
                <blockquote key={`${mention.author}-${mention.day}`} className="border-l-2 border-[var(--border-strong)] pl-3">
                  <p>{mention.text}</p>
                  <footer className="text-xs text-muted-foreground">
                    {name(mention.author)}, le {formatDay(mention.day)}
                  </footer>
                </blockquote>
              ))}
            </section>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
