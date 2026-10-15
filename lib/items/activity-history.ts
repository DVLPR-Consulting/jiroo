import {
  ITEM_KIND_LABELS,
  PRIORITY_LABELS,
  type ItemKind,
  type Priority,
} from "@/lib/design/constants";
import { pointsLabel } from "@/lib/format/plural";

/** Resolves stored ids to display names; undefined when unknown. */
export type HistoryLookup = {
  status: (id: string) => string | undefined;
  user: (id: string) => string | undefined;
  label: (id: string) => string | undefined;
  /** Item key for an item id (the parent). */
  item: (id: string) => string | undefined;
};

/**
 * One history row as the drawer's Activity shows it: the phrase after the
 * actor's name, then « ancien → nouveau » when both sides are known, or
 * the labels added and removed.
 */
export type HistoryDescription = {
  text: string;
  from?: string;
  to?: string;
  added?: string[];
  removed?: string[];
};

type HistoryRow = {
  action: string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
};

const dueDateFormat = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeZone: "UTC",
});

function change(
  text: string,
  row: HistoryRow,
  show: (value: string) => string,
  empty: string,
): HistoryDescription {
  return {
    text,
    from: row.oldValue === null ? empty : show(row.oldValue),
    to: row.newValue === null ? empty : show(row.newValue),
  };
}

function csv(value: string | null): string[] {
  return value ? value.split(",").filter(Boolean) : [];
}

function versionNames(value: string): string {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return value;
    const names = parsed.flatMap((entry) =>
      entry && typeof entry === "object" && "name" in entry && typeof entry.name === "string"
        ? [entry.name]
        : [],
    );
    return names.length > 0 ? names.join(", ") : "Aucune";
  } catch {
    return value;
  }
}

function priorityName(value: string): string {
  return PRIORITY_LABELS[Number(value) as Priority] ?? value;
}

function kindName(value: string): string {
  return ITEM_KIND_LABELS[value as ItemKind] ?? value;
}

function pointsName(value: string): string {
  const points = Number(value);
  return Number.isFinite(points) ? pointsLabel(points) : value;
}

function dueDateName(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dueDateFormat.format(date);
}

export function describeHistory(row: HistoryRow, lookup: HistoryLookup): HistoryDescription {
  // Statuses removed later are stored by name: show the value as is.
  const status = (value: string) => lookup.status(value) ?? value;
  const person = (value: string) => lookup.user(value) ?? "Utilisateur inconnu";

  switch (row.action) {
    case "create":
      return { text: "a créé l’item" };
    case "delete":
      return { text: row.newValue !== null ? "a supprimé l’item" : "a restauré l’item" };
    case "comment":
      return { text: "a commenté" };
    case "status_change":
      return change("a changé le statut", row, status, "Aucun");
    case "move":
      if (row.field === "parent") {
        return change("a changé le parent", row, (id) => lookup.item(id) ?? "Item supprimé", "Aucun");
      }
      return { text: "a changé le rang" };
  }

  switch (row.field) {
    case "title":
      return change("a renommé l’item", row, (value) => value, "Sans titre");
    case "description":
      return { text: "a modifié la description" };
    case "priority":
      return change("a changé la priorité", row, priorityName, "Aucune");
    case "kind":
      return change("a changé la nature", row, kindName, "Aucune");
    case "assignee":
      return change("a changé l’assigné", row, person, "Non assigné");
    case "reporter":
      return change("a changé le rapporteur", row, person, "Aucun");
    case "estimate_points":
      return change("a changé les points", row, pointsName, "Non estimé");
    case "start_date":
      return change("a changé le début", row, dueDateName, "Aucun");
    case "due_date":
      return change("a changé l’échéance", row, dueDateName, "Aucune");
    case "sprint":
      return change("a changé le sprint", row, (name) => name, "Backlog");
    case "fix_versions":
      return change("a changé les Fix versions", row, versionNames, "Aucune");
    case "labels": {
      const before = new Set(csv(row.oldValue));
      const after = new Set(csv(row.newValue));
      const name = (id: string) => lookup.label(id) ?? "label supprimé";
      return {
        text: "a modifié les labels",
        added: [...after].filter((id) => !before.has(id)).map(name),
        removed: [...before].filter((id) => !after.has(id)).map(name),
      };
    }
    case "key":
      return change("a changé la clé", row, (value) => value, "Aucune");
    case "status_category":
      return { text: "a changé la catégorie du statut" };
    case "sprint_commitment":
      return { text: "a engagé l’item au démarrage du sprint" };
    default:
      return { text: "a modifié l’item" };
  }
}
