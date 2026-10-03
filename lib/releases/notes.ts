/**
 * Release notes generated from the current items of a version (Jira behaviour:
 * regenerated on each view). Pure and deterministic: identical input gives a
 * byte-identical Markdown document.
 */

export type ReleaseNotesItem = {
  key: string;
  title: string;
  kind: "feature" | "bug";
  type: "composant" | "epic" | "tache" | "soustache";
  completed: boolean;
};

export type ReleaseNotesModel = {
  releaseName: string;
  description: string | null;
  effectiveReleaseDate: string | null;
  /** True when the item list was capped by the read model. */
  truncated: boolean;
  items: ReleaseNotesItem[];
};

export type ReleaseNotesBuildOptions = {
  includeIncomplete: boolean;
  includeDescription: boolean;
};

const SECTIONS = [
  { kind: "feature", title: "Fonctionnalités" },
  { kind: "bug", title: "Corrections" },
] as const;

const dateFormat = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * Escapes Markdown so user text renders literally (titles, names, description):
 * inline markup, HTML, and every block construct a line can start (headings,
 * lists, quotes, setext underlines, thematic breaks, indented code).
 */
export function escapeMarkdownText(text: string, options: { singleLine?: boolean } = {}) {
  const normalized = text.replace(/\r\n?|[\u2028\u2029]/g, "\n");
  const source = options.singleLine ? normalized.replace(/\s*\n\s*/g, " ") : normalized;
  return source
    .split("\n")
    .map((line) =>
      line
        .trimStart()
        .replace(/[\\`*_[\]#<>|~]/g, "\\$&")
        .replace(/^(\d+)([.)])(?=\s|$)/, "$1\\$2")
        .replace(/^[-+=]/, "\\$&"),
    )
    .join("\n");
}

function compareKeys(left: string, right: string) {
  const parse = (key: string) => {
    const match = /^(.*?)(\d+)$/.exec(key);
    return match ? { prefix: match[1]!, number: Number(match[2]) } : { prefix: key, number: -1 };
  };
  const a = parse(left);
  const b = parse(right);
  if (a.prefix !== b.prefix) return a.prefix < b.prefix ? -1 : 1;
  if (a.number !== b.number) return a.number - b.number;
  return left < right ? -1 : left > right ? 1 : 0;
}

function itemLine(item: ReleaseNotesItem) {
  return `- ${escapeMarkdownText(item.key, { singleLine: true })} — ${escapeMarkdownText(item.title, { singleLine: true })}`;
}

export function buildReleaseNotesMarkdown(
  model: ReleaseNotesModel,
  options: ReleaseNotesBuildOptions,
): string {
  // Sub-tasks roll up into their parent task, as for points ("first level").
  const items = model.items
    .filter((item) => item.type !== "soustache")
    .sort((left, right) => compareKeys(left.key, right.key));
  const completed = items.filter((item) => item.completed);
  const incomplete = items.filter((item) => !item.completed);
  const blocks: string[] = [`# Notes de release — ${escapeMarkdownText(model.releaseName, { singleLine: true })}`];

  if (model.effectiveReleaseDate) {
    blocks.push(
      `Publiée le ${dateFormat.format(new Date(`${model.effectiveReleaseDate}T00:00:00Z`))}.`,
    );
  }
  if (options.includeDescription && model.description?.trim()) {
    blocks.push(escapeMarkdownText(model.description.trim()));
  }
  for (const section of SECTIONS) {
    const lines = completed.filter((item) => item.kind === section.kind).map(itemLine);
    if (lines.length > 0) blocks.push(`## ${section.title}`, lines.join("\n"));
  }
  if (options.includeIncomplete && incomplete.length > 0) {
    blocks.push("## Non terminés", incomplete.map(itemLine).join("\n"));
  }
  if (completed.length === 0 && !(options.includeIncomplete && incomplete.length > 0)) {
    blocks.push("Aucun élément terminé dans cette version.");
  }
  if (model.truncated) {
    blocks.push("_Liste tronquée : la version contient trop d’éléments pour être reprise en entier._");
  }
  return `${blocks.join("\n\n")}\n`;
}
