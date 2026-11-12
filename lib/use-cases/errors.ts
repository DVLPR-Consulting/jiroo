import { ZodError } from "zod";

/**
 * The business rules the services refuse with a French message (JIR-155).
 * The Server Actions keep their own, narrower mappings; the REST API and
 * the MCP server use this table to answer a rule violation with its message
 * instead of hiding it behind a generic failure.
 */
export const DOMAIN_ERROR_MESSAGES = [
  // Items
  "Aucun statut par défaut pour ce backlog.",
  "Backlog introuvable.",
  "Cycle : le nouveau parent est dans le sous-arbre déplacé.",
  "Cycle : un item ne peut pas être son propre parent.",
  "Délai de restauration dépassé.",
  "Hiérarchie invalide pour ce type.",
  "Item introuvable dans la corbeille.",
  "Item introuvable.",
  "Le début doit précéder l’échéance.",
  "Le parent appartient à un autre backlog.",
  "L’item appartient à un autre backlog.",
  "Parent introuvable.",
  "Parent supprimé : restaurez-le d'abord.",
  "Rapporteur introuvable.",
  "Seules les tâches du backlog peuvent être classées.",
  "Seules les tâches peuvent être estimées.",
  "Statut introuvable.",
  "Statut invalide pour ce backlog.",
  "Un ancêtre est supprimé.",
  "Un ou plusieurs labels n'appartiennent pas à ce backlog.",
  "Voisin invalide pour ce backlog.",
  // Sprints
  "Le sprint appartient à un autre backlog.",
  "Le statut d’un item appartient à un autre backlog.",
  "Seules les tâches peuvent être planifiées dans un sprint.",
  "Sprint introuvable.",
  "Un sprint terminé ne peut plus recevoir d’items.",
  // Releases
  "Un ou plusieurs items sont introuvables.",
  "Une ou plusieurs releases sont invalides pour ce backlog.",
  "Une release archivée ne peut pas être ajoutée.",
  // Comments
  "Action réservée à l'auteur du commentaire.",
  "Commentaire introuvable.",
  "Commentaire supprimé.",
  "Le commentaire ne peut pas être vide.",
] as const;

export type DomainErrorMessage = (typeof DOMAIN_ERROR_MESSAGES)[number];

const KNOWN_MESSAGES: ReadonlySet<string> = new Set(DOMAIN_ERROR_MESSAGES);

/**
 * Failures whose text is not meant for the user, answered with the message
 * the actions already show for them.
 */
const REWORDED_FAILURES: ReadonlyArray<readonly [test: (message: string) => boolean, message: string]> = [
  [(m) => m === "Tous les items doivent appartenir au backlog.", "Un ou plusieurs items sont introuvables."],
  [(m) => m.includes("unique"), "Cette clé est déjà utilisée."],
];

/**
 * The user-facing message of a business rule the services refused, or `null`
 * when the error is something else: a validation issue (`ZodError`), an
 * authorization error, or an unexpected failure the caller must not leak.
 */
export function describeDomainError(error: unknown): string | null {
  if (!(error instanceof Error) || error instanceof ZodError) return null;
  if (error.name === "PermissionDeniedError" || error.name === "ResourceNotFoundError") return null;
  if (KNOWN_MESSAGES.has(error.message)) return error.message;
  const reworded = REWORDED_FAILURES.find(([test]) => test(error.message));
  return reworded ? reworded[1] : null;
}

export function isDomainError(error: unknown): boolean {
  return describeDomainError(error) !== null;
}
