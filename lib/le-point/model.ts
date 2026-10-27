/**
 * « Le point » (JIR-107): what a developer or a product owner should look at
 * first, chosen from plain facts. Every card says why it is shown, and an
 * unknown fact stays unknown: no responsible person or date is inferred.
 *
 * Pure functions over a dataset, so the prototype's fixtures and the
 * permission-filtered read of a real backlog (`load.ts`) feed the same rules.
 */

/** A calendar day, `YYYY-MM-DD`. */
export type Day = string;
export type Category = "todo" | "in_progress" | "done";
export type LePointScope = { kind: "team" } | { kind: "me"; viewerId: string };

export type WorkloadRow = {
  /** null means unassigned. */
  assignee: string | null;
  name: string;
  open: number;
  inProgress: number;
  blocked: number;
};

/** A dependency the reader can see, or one in a backlog they cannot browse. */
export type Blocker = { key: string } | { hidden: true };

export type LePointTicket = {
  key: string;
  title: string;
  objective: string | null;
  status: string;
  category: Category;
  /** Shown with its own icon; a ticket is a task unless told otherwise. */
  shape?: "bug" | "subtask";
  /** Only explains a block (another backlog's ticket, an epic, a component): nobody's work here. */
  external?: boolean;
  /**
   * Work the team has committed to: in the active sprint or under way. Only
   * then does a missing assignee put an objective in difficulty; a real
   * backlog's queue is rightly unassigned. Unset, every open ticket counts.
   */
  committed?: boolean;
  assignee: string | null;
  due: Day | null;
  done?: Day;
  blockedBy?: Blocker[];
  lastActivity: Day | null;
  /** No activity is known for this ticket since that day. */
  activityUnknownSince?: Day;
  /** Story points, when estimated (JIR-124). */
  points?: number | null;
  /** In the active sprint (JIR-124). */
  inSprint?: boolean;
  /** Joined the active sprint after it started: scope added mid-sprint (JIR-124). */
  addedAfterStart?: boolean;
};

export type LePointDataset = {
  today: Day;
  /** The reader's previous visit: « Depuis ta dernière visite ». */
  lastVisit: Day;
  /** No previous visit is known: `lastVisit` is then a week ago, and the page says so. */
  firstVisit?: boolean;
  backlog: { key: string; name: string };
  people: { id: string; name: string }[];
  personas: { developer: string; product: string };
  sprint: { name: string; start: Day; end: Day } | null;
  releases: { name: string; planned: Day | null; released: Day | null }[];
  objectives: {
    key: string;
    title: string;
    due: Day | null;
    release: string | null;
    /** Some of its tickets shipped, not all: no delivery may be claimed. */
    partial?: boolean;
  }[];
  tickets: LePointTicket[];
  mentions: { ticket: string; author: string; mentioned: string; day: Day; text: string }[];
};

export type LePointCard = {
  key: string;
  title: string;
  status: string;
  category: Category;
  shape?: "bug" | "subtask";
  assigneeName: string | null;
  objective: { key: string; title: string } | null;
  due: Day | null;
  /** « Pourquoi je vois ceci », one verifiable fact. */
  reason: string;
  /** The reason in a few words, for the row: « En retard de 2 jours », « Attend PORT-84 ». */
  tag: string;
  tone: Tone;
  /** Other tickets the reason names, to open them. */
  links: string[];
};

/** How urgent a row's tag reads. */
export type Tone = "danger" | "warning" | "neutral" | "success";

export type ObjectiveSummary = {
  key: string;
  title: string;
  total: number;
  done: number;
  inProgress: number;
  blocked: number;
  todo: number;
  due: Day | null;
  delivery: string;
  /** The delivery in a few words: « Portail 2.0 · 29 janv. », « Livré », « Aucune ». */
  deliveryTag: string;
};

export type ReleaseSummary = {
  name: string;
  planned: Day | null;
  objectives: { key: string; title: string }[];
  openCount: number;
};

const DAY_FORMAT = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const END_OF_TIME = "9999-12-31";

/** « 5 nov. », « 12 mai » */
export function formatDay(day: Day): string {
  return DAY_FORMAT.format(new Date(`${day}T00:00:00Z`));
}

export function daysFrom(from: Day, to: Day): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

const days = (count: number) => `${count} jour${count > 1 ? "s" : ""}`;
/** Ends a sentence, without doubling an abbreviation's dot (« nov. »). */
const sentence = (text: string) => (text.endsWith(".") ? text : `${text}.`);
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const uncapitalize = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/** The due phrase, lowercase: « échéance le 5 nov., dans 2 jours ». */
function duePhrase(due: Day | null, today: Day): string {
  if (!due) return "pas d’échéance";
  const delta = daysFrom(today, due);
  if (delta < 0) return `échéance dépassée de ${days(-delta)} (${formatDay(due)})`;
  if (delta === 0) return "échéance aujourd’hui";
  if (delta === 1) return `échéance demain, le ${formatDay(due)}`;
  return `échéance le ${formatDay(due)}, dans ${days(delta)}`;
}

/** « Leo R. »: enough to recognise a teammate on a row. */
function shortName(name: string): string {
  const [first, ...rest] = name.trim().split(/\s+/);
  const last = rest.at(-1);
  return last ? `${first} ${last.charAt(0)}.` : first ?? name;
}

function dueTag(due: Day | null, today: Day): { tag: string; tone: Tone } {
  if (!due) return { tag: "Sans échéance", tone: "neutral" };
  const delta = daysFrom(today, due);
  if (delta < 0) return { tag: `En retard de ${days(-delta)}`, tone: "danger" };
  if (delta === 0) return { tag: "Échéance aujourd’hui", tone: "warning" };
  if (delta === 1) return { tag: "Échéance demain", tone: "warning" };
  return { tag: `Échéance ${formatDay(due)}`, tone: delta <= 3 ? "warning" : "neutral" };
}

/** The blockers still open: a done dependency no longer blocks. */
export function openBlockersOf(ticket: LePointTicket, tickets: Map<string, LePointTicket>): Blocker[] {
  return (ticket.blockedBy ?? []).filter((blocker) =>
    "hidden" in blocker ? true : tickets.get(blocker.key)?.category !== "done",
  );
}

function context(data: LePointDataset) {
  const tickets = new Map(data.tickets.map((ticket) => [ticket.key, ticket]));
  const people = new Map(data.people.map((person) => [person.id, person.name]));
  const objectives = new Map(data.objectives.map((objective) => [objective.key, objective]));

  const openBlockers = (ticket: LePointTicket) => openBlockersOf(ticket, tickets);
  const isBlocked = (ticket: LePointTicket) => openBlockers(ticket).length > 0;

  function blockedReason(ticket: LePointTicket): string {
    return openBlockers(ticket)
      .map((blocker) => {
        if ("hidden" in blocker) return "Attend un ticket que tu ne peux pas voir.";
        const dependency = tickets.get(blocker.key);
        if (!dependency) return `Attend ${blocker.key}, un ticket introuvable.`;
        const state = dependency.category === "in_progress" ? "en cours" : "à faire";
        const holder = dependency.assignee ? people.get(dependency.assignee) : undefined;
        return `Attend ${dependency.key} « ${dependency.title} », ${state}${holder ? ` chez ${holder}` : ", sans assigné"}.`;
      })
      .join(" ");
  }

  /** The first open blocker, in a few words. */
  function blockedTag(ticket: LePointTicket): string {
    const [first, ...others] = openBlockers(ticket);
    const more = others.length > 0 ? ` +${others.length}` : "";
    return first && "hidden" in first ? `Attend un ticket caché${more}` : `Attend ${first?.key ?? ""}${more}`;
  }

  function card(ticket: LePointTicket, reason: string, tag: string, tone: Tone): LePointCard {
    const objective = ticket.objective ? objectives.get(ticket.objective) : undefined;
    return {
      key: ticket.key,
      title: ticket.title,
      status: ticket.status,
      category: ticket.category,
      ...(ticket.shape ? { shape: ticket.shape } : {}),
      assigneeName: ticket.assignee ? people.get(ticket.assignee) ?? null : null,
      objective: objective ? { key: objective.key, title: objective.title } : null,
      due: ticket.due,
      reason,
      tag,
      tone,
      // Only tickets the dataset knows can be opened.
      links: openBlockers(ticket).flatMap((blocker) =>
        "hidden" in blocker || !tickets.has(blocker.key) ? [] : [blocker.key],
      ),
    };
  }

  return { tickets, people, isBlocked, blockedReason, blockedTag, card };
}

const byDue = (a: LePointTicket, b: LePointTicket) =>
  (a.due ?? END_OF_TIME).localeCompare(b.due ?? END_OF_TIME)
  || a.key.localeCompare(b.key, "fr", { numeric: true });

/** Développement : « Que reprendre maintenant ? Qu'est-ce qui m'empêche d'avancer ? » */
export function developerView(data: LePointDataset, scope: LePointScope): {
  resume: LePointCard[];
  blocked: LePointCard[];
  next: LePointCard[];
  withoutDue: LePointCard[];
  recent: LePointCard[];
  workload: WorkloadRow[];
} {
  const { tickets, people, isBlocked, blockedReason, blockedTag, card } = context(data);
  const work = data.tickets.filter((ticket) =>
    !ticket.external && (scope.kind === "team" || ticket.assignee === scope.viewerId),
  );
  const open = work.filter((ticket) => ticket.category !== "done");

  const resume = open
    .filter((ticket) => ticket.category === "in_progress" && !isBlocked(ticket))
    .sort(byDue)
    .map((ticket) => {
      const { tag, tone } = dueTag(ticket.due, data.today);
      return card(ticket, sentence(`En cours ; ${duePhrase(ticket.due, data.today)}`), tag, tone);
    });

  const blocked = open.filter(isBlocked).map((ticket) => card(ticket, blockedReason(ticket), blockedTag(ticket), "danger"));

  const waiting = open.filter((ticket) => ticket.category === "todo" && !isBlocked(ticket));
  const next = waiting
    .filter((ticket) => ticket.due !== null)
    .sort(byDue)
    .map((ticket) => {
      const { tag, tone } = dueTag(ticket.due, data.today);
      return card(ticket, sentence(capitalize(duePhrase(ticket.due, data.today))), tag, tone);
    });
  const withoutDue = waiting
    .filter((ticket) => ticket.due === null && (scope.kind === "me" || ticket.committed !== false))
    .map((ticket) => card(ticket, "Pas d’échéance.", "Sans échéance", "neutral"));

  // Done since the last visit, and open tickets a dependency released since.
  const events: { day: Day; card: LePointCard }[] = [];
  for (const ticket of work) {
    const doneDependencies = (ticket.blockedBy ?? []).flatMap((blocker) => {
      if ("hidden" in blocker) return [];
      const dependency = tickets.get(blocker.key);
      return dependency?.done ? [{ key: dependency.key, done: dependency.done }] : [];
    });
    if (ticket.done && ticket.done > data.lastVisit) {
      const parts = [
        `Terminé le ${formatDay(ticket.done)}`,
        ...doneDependencies.map((dependency) => `${dependency.key}, qui le bloquait, est terminé`),
      ];
      events.push({ day: ticket.done, card: card(ticket, sentence(parts.join(" ; ")), `Terminé le ${formatDay(ticket.done)}`, "success") });
    } else if (ticket.category !== "done" && !isBlocked(ticket)) {
      // Released since the last visit when its last dependency was done then.
      const day = doneDependencies.map((dependency) => dependency.done).sort().at(-1);
      if (day && day > data.lastVisit) {
        const parts = [...doneDependencies]
          .sort((a, b) => a.done.localeCompare(b.done))
          .map((dependency) => `${dependency.key} terminé le ${formatDay(dependency.done)}`);
        events.push({ day, card: card(ticket, sentence(`N’est plus bloqué : ${parts.join(", ")}`), `Débloqué le ${formatDay(day)}`, "success") });
      }
    }
  }
  const recent = events.sort((a, b) => b.day.localeCompare(a.day)).map((event) => event.card);

  const workloadByAssignee = new Map<string | null, WorkloadRow>();
  if (scope.kind === "team") {
    for (const ticket of open) {
      if (ticket.assignee === null && ticket.committed === false) continue;
      let row = workloadByAssignee.get(ticket.assignee);
      if (!row) {
        row = {
          assignee: ticket.assignee,
          name: ticket.assignee === null ? "Sans assigné" : people.get(ticket.assignee) ?? "Personne inconnue",
          open: 0,
          inProgress: 0,
          blocked: 0,
        };
        workloadByAssignee.set(ticket.assignee, row);
      }
      row.open += 1;
      if (ticket.category === "in_progress") row.inProgress += 1;
      if (isBlocked(ticket)) row.blocked += 1;
    }
  }
  const workload = [...workloadByAssignee.values()].sort((a, b) =>
    Number(a.assignee === null) - Number(b.assignee === null)
    || b.open - a.open
    || a.name.localeCompare(b.name, "fr"),
  );

  return { resume, blocked, next, withoutDue, recent, workload };
}

/** Produit : « Quelle décision me revient ? Où en sont les objectifs ? » */
export function productView(data: LePointDataset, scope: LePointScope): {
  decisions: LePointCard[];
  objectives: ObjectiveSummary[];
  difficulties: LePointCard[];
  nextRelease: ReleaseSummary | null;
} {
  const { tickets, people, isBlocked, blockedReason, blockedTag, card } = context(data);

  // The latest explicit request per open ticket, and per recipient in team scope.
  const asked = new Map<string, LePointDataset["mentions"][number]>();
  for (const mention of data.mentions) {
    const ticket = tickets.get(mention.ticket);
    if (!ticket || ticket.category === "done" || (scope.kind === "me" && mention.mentioned !== scope.viewerId)) continue;
    const key = scope.kind === "team" ? JSON.stringify([mention.ticket, mention.mentioned]) : mention.ticket;
    const previous = asked.get(key);
    if (!previous || previous.day < mention.day) asked.set(key, mention);
  }
  const requests = [...asked.values()];
  if (scope.kind === "team") {
    requests.sort((a, b) => b.day.localeCompare(a.day) || a.ticket.localeCompare(b.ticket, "fr", { numeric: true }));
  }
  const decisions = requests.map((mention) => {
    const ticket = tickets.get(mention.ticket)!;
    const author = people.get(mention.author) ?? "quelqu’un";
    const recipient = people.get(mention.mentioned) ?? "quelqu’un";
    const due = ticket.due ? ` ; échéance le ${formatDay(ticket.due)}` : "";
    const request = scope.kind === "team" ? `Demandé à ${recipient} par ${author}` : `Demandé par ${author}`;
    return card(
      ticket,
      sentence(`${request} dans un commentaire du ${formatDay(mention.day)}${due}`),
      scope.kind === "team" ? `Pour ${shortName(recipient)}` : `Demandé par ${shortName(author)}`,
      "warning",
    );
  });

  const releases = new Map(data.releases.map((release) => [release.name, release]));
  const objectives: ObjectiveSummary[] = data.objectives.map((objective) => {
    const children = data.tickets.filter((ticket) => ticket.objective === objective.key);
    const count = (keep: (ticket: LePointTicket) => boolean) => children.filter(keep).length;
    const done = count((ticket) => ticket.category === "done");
    const release = objective.release ? releases.get(objective.release) : undefined;
    let delivery: string;
    let deliveryTag: string;
    if (!release) {
      delivery = objective.partial
        ? "Livraison partielle : une partie seulement de ses tickets est dans une livraison publiée."
        : "Aucune livraison prévue.";
      deliveryTag = objective.partial ? "Livraison partielle" : "Aucune";
    }
    else if (release.released) {
      delivery = sentence(`Livré dans la livraison ${release.name}, le ${formatDay(release.released)}`);
      deliveryTag = `Livré · ${release.name}`;
    }
    else if (children.length > 0 && done === children.length) {
      delivery = `Terminé — pas encore livré : la livraison ${release.name} n’est pas publiée.`;
      deliveryTag = `${release.name} · à publier`;
    } else {
      const when = release.planned ? `planifiée le ${formatDay(release.planned)}` : "sans date planifiée";
      delivery = sentence(`Prévu dans la livraison ${release.name}, ${when}`);
      deliveryTag = release.planned ? `${release.name} · ${formatDay(release.planned)}` : release.name;
    }
    return {
      key: objective.key,
      title: objective.title,
      total: children.length,
      done,
      inProgress: count((ticket) => ticket.category === "in_progress" && !isBlocked(ticket)),
      blocked: count((ticket) => ticket.category !== "done" && isBlocked(ticket)),
      todo: count((ticket) => ticket.category === "todo" && !isBlocked(ticket)),
      due: objective.due,
      delivery,
      deliveryTag,
    };
  });

  const difficulties = data.tickets
    .filter((ticket) => ticket.objective !== null && ticket.category !== "done")
    .flatMap((ticket) => {
      const blocked = isBlocked(ticket);
      const unassigned = ticket.assignee === null && ticket.committed !== false;
      const reasons = [
        ...(blocked ? [`Bloqué : ${uncapitalize(blockedReason(ticket))}`] : []),
        ...(unassigned ? ["Personne n’est assigné."] : []),
      ];
      if (reasons.length === 0) return [];
      return [card(ticket, reasons.join(" "), blocked ? blockedTag(ticket) : "Sans assigné", blocked ? "danger" : "warning")];
    });

  const upcoming = data.releases
    .filter((release) => !release.released)
    .sort((a, b) => (a.planned ?? END_OF_TIME).localeCompare(b.planned ?? END_OF_TIME))[0];
  let nextRelease: ReleaseSummary | null = null;
  if (upcoming) {
    const included = data.objectives.filter((objective) => objective.release === upcoming.name);
    const keys = new Set(included.map((objective) => objective.key));
    nextRelease = {
      name: upcoming.name,
      planned: upcoming.planned,
      objectives: included.map(({ key, title }) => ({ key, title })),
      openCount: data.tickets.filter(
        (ticket) => ticket.objective !== null && keys.has(ticket.objective) && ticket.category !== "done",
      ).length,
    };
  }

  return { decisions, objectives, difficulties, nextRelease };
}
