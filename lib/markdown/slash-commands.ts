/**
 * Blocks offered by the « / » menu of the description editor. Only nodes the
 * stored Markdown round-trips (see editor-extensions / markdown-document) are
 * listed: no table, image or raw HTML.
 */
import type { ChainedCommands } from "@tiptap/react";

export type SlashCommandId =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "bulletList"
  | "orderedList"
  | "taskList"
  | "blockquote"
  | "codeBlock"
  | "horizontalRule";

export type SlashCommand = {
  id: SlashCommandId;
  label: string;
  /** Markdown typed directly in the editor for the same block. */
  shortcut: string;
  /** Extra search terms (English names, Markdown syntax). */
  keywords: string[];
  /** Turns the current block into this one (the « /query » is already removed). */
  run: (chain: ChainedCommands) => ChainedCommands;
};

export const SLASH_COMMANDS: readonly SlashCommand[] = [
  {
    id: "paragraph",
    label: "Texte",
    shortcut: "",
    keywords: ["paragraphe", "text", "normal"],
    run: (chain) => chain.setParagraph(),
  },
  {
    id: "heading1",
    label: "Titre 1",
    shortcut: "#",
    keywords: ["h1", "heading"],
    run: (chain) => chain.setHeading({ level: 1 }),
  },
  {
    id: "heading2",
    label: "Titre 2",
    shortcut: "##",
    keywords: ["h2", "heading"],
    run: (chain) => chain.setHeading({ level: 2 }),
  },
  {
    id: "heading3",
    label: "Titre 3",
    shortcut: "###",
    keywords: ["h3", "heading"],
    run: (chain) => chain.setHeading({ level: 3 }),
  },
  {
    id: "bulletList",
    label: "Liste à puces",
    shortcut: "-",
    keywords: ["bullet", "ul"],
    run: (chain) => chain.setParagraph().toggleBulletList(),
  },
  {
    id: "orderedList",
    label: "Liste numérotée",
    shortcut: "1.",
    keywords: ["numbered", "ordered", "ol"],
    run: (chain) => chain.setParagraph().toggleOrderedList(),
  },
  {
    id: "taskList",
    label: "Liste de tâches",
    shortcut: "[]",
    keywords: ["todo", "checkbox", "cases"],
    run: (chain) => chain.setParagraph().toggleTaskList(),
  },
  {
    id: "blockquote",
    label: "Citation",
    shortcut: ">",
    keywords: ["quote", "blockquote"],
    run: (chain) => chain.setParagraph().toggleBlockquote(),
  },
  {
    id: "codeBlock",
    label: "Bloc de code",
    shortcut: "```",
    keywords: ["pre", "snippet"],
    run: (chain) => chain.setCodeBlock(),
  },
  {
    id: "horizontalRule",
    label: "Séparateur",
    shortcut: "---",
    keywords: ["hr", "divider", "ligne"],
    run: (chain) => chain.setHorizontalRule(),
  },
];

function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** Commands matching the text typed after « / », label prefixes first. */
export function filterSlashCommands(query: string): SlashCommand[] {
  const needle = fold(query.trim());
  if (!needle) return [...SLASH_COMMANDS];
  const prefix: SlashCommand[] = [];
  const other: SlashCommand[] = [];
  for (const command of SLASH_COMMANDS) {
    const label = fold(command.label);
    if (label.startsWith(needle)) prefix.push(command);
    else if (
      label.includes(needle) ||
      command.keywords.some((keyword) => fold(keyword).includes(needle)) ||
      (command.shortcut !== "" && command.shortcut === needle)
    ) {
      other.push(command);
    }
  }
  return [...prefix, ...other];
}
