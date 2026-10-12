/**
 * Single source of truth for Jiroo's keyboard shortcuts: the global key
 * handler, the « Raccourcis clavier » dialog and the /aide guide all read this
 * list. Keys follow Jira Cloud where Jira has an equivalent (see `jira`).
 *
 * - `sequence` shortcuts are single printable keys (or a `g` sequence) matched
 *   by the shortcut engine; they obey the « single-key shortcuts » toggle
 *   (WCAG 2.1.4) and never fire while typing in a field.
 * - `combo` shortcuts use a modifier or only apply inside one control; they
 *   are handled by their own component and listed here for reference only.
 */

export const SHORTCUT_GROUPS = [
  { id: "global", title: "Général" },
  { id: "navigation", title: "Aller à (g puis une lettre)" },
  { id: "list", title: "Listes : Backlog, Board, Liste, Arbre" },
  { id: "item", title: "Ticket ouvert" },
  { id: "other", title: "Autres raccourcis" },
] as const;

export type ShortcutGroupId = (typeof SHORTCUT_GROUPS)[number]["id"];

type ShortcutBase = {
  id: string;
  group: ShortcutGroupId;
  /** French description shown in the dialog and the guide. */
  label: string;
  /** The Jira Cloud shortcut this one mirrors, when there is one. */
  jira?: string;
};

export type SequenceShortcut = ShortcutBase & {
  kind: "sequence";
  /** Keys pressed one after another, e.g. ["g", "b"]. */
  sequence: readonly string[];
  /** Another key with the same effect, handled natively (display only). */
  alternative?: string;
};

export type ComboShortcut = ShortcutBase & {
  kind: "combo";
  /** Keys pressed together, e.g. ["⌘/Ctrl", "K"]. */
  combo: readonly string[];
};

export type ShortcutDefinition = SequenceShortcut | ComboShortcut;

export const SHORTCUTS = [
  // Général
  { id: "help", kind: "sequence", group: "global", sequence: ["?"], label: "Afficher les raccourcis clavier", jira: "?" },
  { id: "search", kind: "sequence", group: "global", sequence: ["/"], label: "Rechercher un ticket", jira: "/" },
  { id: "create", kind: "sequence", group: "global", sequence: ["c"], label: "Nouvel item (dans une vue de backlog)", jira: "c" },
  { id: "toggleSidebar", kind: "sequence", group: "global", sequence: ["["], label: "Masquer ou afficher la barre latérale", jira: "[" },

  // Aller à
  { id: "go.backlog", kind: "sequence", group: "navigation", sequence: ["g", "b"], label: "Backlog" },
  { id: "go.board", kind: "sequence", group: "navigation", sequence: ["g", "a"], label: "Board", jira: "g puis a (board agile)" },
  { id: "go.list", kind: "sequence", group: "navigation", sequence: ["g", "i"], label: "Liste", jira: "g puis i (liste des tickets)" },
  { id: "go.tree", kind: "sequence", group: "navigation", sequence: ["g", "t"], label: "Arbre" },
  { id: "go.releases", kind: "sequence", group: "navigation", sequence: ["g", "v"], label: "Releases (versions)" },
  { id: "go.reports", kind: "sequence", group: "navigation", sequence: ["g", "r"], label: "Rapports" },
  { id: "go.help", kind: "sequence", group: "navigation", sequence: ["g", "u"], label: "Aide (guide d’utilisation)" },

  // Listes
  { id: "list.next", kind: "sequence", group: "list", sequence: ["j"], label: "Ticket suivant", jira: "j" },
  { id: "list.previous", kind: "sequence", group: "list", sequence: ["k"], label: "Ticket précédent", jira: "k" },
  { id: "list.open", kind: "sequence", group: "list", sequence: ["o"], alternative: "Entrée", label: "Ouvrir le ticket sélectionné", jira: "o" },

  // Ticket ouvert
  { id: "item.edit", kind: "sequence", group: "item", sequence: ["e"], label: "Modifier le titre", jira: "e" },
  { id: "item.comment", kind: "sequence", group: "item", sequence: ["m"], label: "Commenter", jira: "m" },
  { id: "item.assign", kind: "sequence", group: "item", sequence: ["a"], label: "Choisir l’assigné", jira: "a" },
  { id: "item.assignToMe", kind: "sequence", group: "item", sequence: ["i"], label: "M’assigner le ticket", jira: "i" },
  { id: "item.status", kind: "sequence", group: "item", sequence: ["s"], label: "Changer le statut" },
  { id: "item.next", kind: "sequence", group: "item", sequence: ["j"], label: "Item suivant de la liste", jira: "j" },
  { id: "item.previous", kind: "sequence", group: "item", sequence: ["k"], label: "Item précédent de la liste", jira: "k" },
  { id: "item.close", kind: "combo", group: "item", combo: ["Échap"], label: "Fermer le ticket", jira: "Échap" },

  // Autres
  { id: "searchCombo", kind: "combo", group: "other", combo: ["⌘/Ctrl", "K"], label: "Ouvrir ou fermer la recherche (dans un éditeur de texte : ajouter un lien)" },
  { id: "selectAll", kind: "combo", group: "other", combo: ["⌘/Ctrl", "A"], label: "Tout sélectionner (Liste, Backlog) ; Échap vide la sélection" },
  { id: "rangeSelect", kind: "combo", group: "other", combo: ["Maj", "clic"], label: "Sélectionner une plage de cases" },
  { id: "sendComment", kind: "combo", group: "other", combo: ["⌘/Ctrl", "Entrée"], label: "Envoyer un commentaire" },
  { id: "descriptionEdit", kind: "combo", group: "other", combo: ["/"], label: "Description : insérer un bloc (Échap quitte la description, un second Échap ferme le ticket)" },
  { id: "titleEdit", kind: "combo", group: "other", combo: ["Entrée"], label: "Titre en édition : enregistrer (Échap annule)" },
  { id: "keyboardDrag", kind: "combo", group: "other", combo: ["Espace"], label: "Glisser-déposer au clavier : Espace pour saisir, flèches pour déplacer, Espace pour déposer" },
] as const satisfies readonly ShortcutDefinition[];

export type ShortcutId = (typeof SHORTCUTS)[number]["id"];

export type SequenceShortcutId = Extract<
  (typeof SHORTCUTS)[number],
  { kind: "sequence" }
>["id"];

export function isSequenceShortcut(
  shortcut: ShortcutDefinition,
): shortcut is SequenceShortcut {
  return shortcut.kind === "sequence";
}

export const SEQUENCE_SHORTCUTS: readonly (SequenceShortcut & { id: SequenceShortcutId })[] =
  SHORTCUTS.filter(isSequenceShortcut) as (SequenceShortcut & { id: SequenceShortcutId })[];

export function shortcutsInGroup(group: ShortcutGroupId): readonly ShortcutDefinition[] {
  return SHORTCUTS.filter((shortcut) => shortcut.group === group);
}

/** Group of a sequence shortcut, used to pick the context it may fire in. */
export function sequenceShortcutGroup(id: SequenceShortcutId): ShortcutGroupId {
  return SEQUENCE_SHORTCUTS.find((shortcut) => shortcut.id === id)!.group;
}

/** Groups whose sequence shortcuts may fire in each context. */
const CONTEXT_GROUPS = {
  page: ["global", "navigation", "list"],
  item: ["global", "navigation", "item"],
} as const satisfies Record<"page" | "item", readonly ShortcutGroupId[]>;

/**
 * The shortcut a matched key sequence stands for in `context`: list keys
 * act on the page, item keys in the open item drawer, so « j » / « k » are
 * the list's next / previous on the page and the drawer's next / previous
 * item inside it. Null when nothing applies there.
 */
export function sequenceShortcutForContext(
  id: SequenceShortcutId,
  context: "page" | "item",
): SequenceShortcutId | null {
  const matched = SEQUENCE_SHORTCUTS.find((shortcut) => shortcut.id === id);
  if (!matched) return null;
  const groups: readonly ShortcutGroupId[] = CONTEXT_GROUPS[context];
  const fitting = SEQUENCE_SHORTCUTS.find(
    (shortcut) =>
      groups.includes(shortcut.group) &&
      shortcut.sequence.length === matched.sequence.length &&
      shortcut.sequence.every((key, index) => key === matched.sequence[index]),
  );
  return fitting?.id ?? null;
}

/** The keys to render, one `<kbd>` each, with the word between them. */
export function shortcutKeyParts(shortcut: ShortcutDefinition): {
  keys: string[];
  joiner: "puis" | "+";
  alternative?: string;
} {
  if (shortcut.kind === "combo") return { keys: [...shortcut.combo], joiner: "+" };
  return {
    keys: shortcut.sequence.map(displayKey),
    joiner: "puis",
    alternative: shortcut.alternative,
  };
}

function displayKey(key: string): string {
  return /^[a-z]$/.test(key) ? key.toUpperCase() : key;
}

/** Plain-text form, e.g. "G puis B" or "⌘/Ctrl + K" (aria labels, titles). */
export function shortcutText(shortcut: ShortcutDefinition): string {
  const { keys, joiner, alternative } = shortcutKeyParts(shortcut);
  const main = keys.join(` ${joiner} `);
  return alternative ? `${main} ou ${alternative}` : main;
}
