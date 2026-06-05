// Hard-coded ticket templates — pure constants, no DB.
// Each template prefills the New-item dialog with a kind and a markdown description skeleton.

import type { ItemKind } from "@/lib/design/constants";

export type ItemTemplate = {
  id: string;
  /** FR display name shown in the template picker */
  name: string;
  kind: ItemKind;
  /** Markdown skeleton seeded into the description field on creation */
  description: string;
};

export const ITEM_TEMPLATES: ItemTemplate[] = [
  {
    id: "bug-report",
    name: "Rapport de bug",
    kind: "bug",
    description:
      "## Étapes pour reproduire\n1. \n2. \n3. \n\n## Comportement attendu\n\n## Comportement observé\n\n## Environnement\n",
  },
  {
    id: "user-story",
    name: "User story",
    kind: "feature",
    description:
      "**En tant que** \n**je veux** \n**afin de** \n\n## Critères d'acceptation\n- [ ] \n",
  },
];

/** Returns the template matching the given id, or undefined if not found. */
export function getTemplate(id: string): ItemTemplate | undefined {
  return ITEM_TEMPLATES.find((t) => t.id === id);
}
